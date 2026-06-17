"""Authenticated chat assistant: Firestore facts + optional Pinecone RAG + Gemini."""

from __future__ import annotations

import json
import logging
import os
from typing import Any, Dict, List

from flask import Blueprint, jsonify, request
from google.cloud import firestore

from server.assistant_facts import build_assistant_facts
from server.chat_context import prompt_context_json
from server.firebase_util import init_firebase_admin, verify_bearer_uid_and_email_verified
from server.gemini_client import chat_model_name, generate_chat_reply
from server.intent_chat import needs_semantic_retrieval
from server.langfuse_tracing import chat_trace_session
from server.prompt_loader import (
    rag_block_for_grounding,
    render_chat_system_prompt,
    resolve_grounding_mode,
)
from server.rate_limit import TokenBucketLimiter
from server.rerank import rerank_enabled, rerank_pinecone_matches

logger = logging.getLogger(__name__)

chat_routes = Blueprint("chat", __name__)

MAX_USER_MESSAGE_CHARS = 4000
MAX_HISTORY_TURNS = 14
MAX_HISTORY_CONTENT_CHARS = 8000
# API citation snippets (shorter than prompt content cap).
SOURCE_SNIPPET_MAX_CHARS = int(os.environ.get("CHAT_SOURCE_SNIPPET_CHARS", "320"))

# Pinecone retrieve width vs how many chunks go into the prompt / sources[] (#71).
_RAG_RETRIEVE_K_DEFAULT = 24
_RAG_PROMPT_K_DEFAULT = 8
_RAG_K_MAX = 100


def _parse_rag_k_env(key: str, default: int) -> int:
    raw = (os.environ.get(key) or "").strip()
    if not raw:
        return default
    try:
        n = int(raw)
    except ValueError:
        logger.warning("Invalid %s=%r; using default %d", key, raw, default)
        return default
    if n < 1:
        logger.warning("%s must be >= 1 (got %d); using default %d", key, n, default)
        return default
    if n > _RAG_K_MAX:
        logger.warning("%s capped at %d (got %d)", key, _RAG_K_MAX, n)
        return _RAG_K_MAX
    return n


def rag_k_limits() -> tuple[int, int]:
    """Return (retrieve_k, prompt_k) for Pinecone query and prompt/sources slice."""
    retrieve_k = _parse_rag_k_env("RAG_RETRIEVE_K", _RAG_RETRIEVE_K_DEFAULT)
    prompt_k = _parse_rag_k_env("RAG_PROMPT_K", _RAG_PROMPT_K_DEFAULT)
    if prompt_k > retrieve_k:
        prompt_k = retrieve_k
    return retrieve_k, prompt_k

# Per-UID/IP token buckets to cap Gemini/Pinecone usage.
_UID_RATE_CAPACITY = int(os.environ.get("CHAT_UID_RATE_CAPACITY", "3"))
_UID_RATE_REFILL = float(os.environ.get("CHAT_UID_RATE_REFILL_PER_SEC", "0.5"))
_IP_RATE_CAPACITY = int(os.environ.get("CHAT_IP_RATE_CAPACITY", "10"))
_IP_RATE_REFILL = float(os.environ.get("CHAT_IP_RATE_REFILL_PER_SEC", "1"))

_uid_limiter = TokenBucketLimiter(capacity=_UID_RATE_CAPACITY, refill_per_second=_UID_RATE_REFILL)
_ip_limiter = TokenBucketLimiter(capacity=_IP_RATE_CAPACITY, refill_per_second=_IP_RATE_REFILL)


def _client_ip() -> str:
    # Trust X-Forwarded-For only when it’s present; otherwise fall back to the
    # socket peer address.
    xff = request.headers.get("X-Forwarded-For", "").strip()
    if xff:
        first = xff.split(",", 1)[0].strip()
        if first:
            return first
    if request.remote_addr:
        return request.remote_addr
    return "unknown"


def _check_rate(uid: str, ip: str) -> tuple[Dict[str, Any], int] | None:
    if not _uid_limiter.allow(uid, cost=1.0):
        return {"error": "rate_limited"}, 429
    # Also cap by IP to reduce abuse from account-creation/spam.
    ip_key = ip or "unknown"
    if not _ip_limiter.allow(ip_key, cost=1.0):
        return {"error": "rate_limited"}, 429
    return None


def _env_truthy(key: str) -> bool:
    return (os.environ.get(key) or "").strip().lower() in ("1", "true", "yes", "on")


def _log_built_prompt(
    *,
    uid: str,
    prompt: str,
    user_message: str,
    context_json: str,
    rag_block: str,
    history_lines: str,
    use_rag: bool,
    match_count: int,
    history_turns: int,
) -> None:
    """Observability for prompt assembly. Full text may contain PII — use DEBUG or opt-in INFO."""
    plen = len(prompt)
    logger.info(
        "chat_assistant prompt_build uid=%s total_chars=%d user_msg_chars=%d "
        "context_json_chars=%d rag_block_chars=%d history_chars=%d "
        "history_turns=%d rag_requested=%s rag_match_count=%d",
        uid,
        plen,
        len(user_message),
        len(context_json),
        len(rag_block),
        len(history_lines),
        history_turns,
        use_rag,
        match_count,
    )
    preview_n = int(os.environ.get("CHAT_LOG_PROMPT_PREVIEW_CHARS", "0") or "0")
    if preview_n > 0:
        logger.info(
            "chat_assistant prompt_preview (first %d of %d chars):\n%s",
            min(preview_n, plen),
            plen,
            prompt[:preview_n],
        )
    if _env_truthy("CHAT_LOG_FULL_PROMPT"):
        logger.info("chat_assistant full_prompt:\n%s", prompt)
    else:
        logger.debug("chat_assistant full_prompt (%d chars):\n%s", plen, prompt)


def _sanitize_chat_payload(message: str, history_raw: object) -> tuple[str, List[Dict[str, str]]]:
    msg = message.strip()[:MAX_USER_MESSAGE_CHARS]
    history: List[Dict[str, str]] = []
    if isinstance(history_raw, list):
        for item in history_raw[-MAX_HISTORY_TURNS:]:
            if not isinstance(item, dict):
                continue
            role = item.get("role")
            content = item.get("content")
            if role in ("user", "assistant") and isinstance(content, str) and content.strip():
                history.append(
                    {
                        "role": role,
                        "content": content.strip()[:MAX_HISTORY_CONTENT_CHARS],
                    }
                )
    return msg, history


def _pinecone_matches_for_user(uid: str, query_text: str, top_k: int) -> List[Dict[str, Any]]:
    try:
        from pinecone import Pinecone  # type: ignore[import-untyped]
        import os
        from server.gemini_client import embed_query_text

        api_key = (os.environ.get("PINECONE_API_KEY") or "").strip()
        index_name = (os.environ.get("PINECONE_INDEX_NAME") or "").strip()
        if not api_key or not index_name:
            return []

        vec = embed_query_text(query_text)
        pc = Pinecone(api_key=api_key)
        index = pc.Index(index_name)
        q = index.query(
            vector=vec,
            top_k=top_k,
            include_metadata=True,
            filter={"user_id": uid},
        )
        matches: List[Dict[str, Any]] = []
        for m in getattr(q, "matches", []) or []:
            md = getattr(m, "metadata", None) or {}
            if not isinstance(md, dict):
                md = {}
            content = md.get("content")
            if not isinstance(content, str):
                content = ""
            vector_id = getattr(m, "id", None)
            matches.append(
                {
                    "id": vector_id if isinstance(vector_id, str) else None,
                    "score": getattr(m, "score", None),
                    "content": content[:4000],
                    "metadata": {
                        "type": md.get("type"),
                        "date": md.get("date") or md.get("dateCreated"),
                        "challengeId": md.get("challengeId"),
                    },
                }
            )
        return matches
    except Exception as e:
        logger.warning("Pinecone query failed: %s", e)
        return []


def _format_numbered_rag_block(matches: List[Dict[str, Any]]) -> str:
    """Numbered list for citation markers [1], [2] aligned with sources[].index."""
    lines: List[str] = []
    for i, match in enumerate(matches, start=1):
        md = match.get("metadata") or {}
        t = md.get("type") if isinstance(md, dict) else None
        type_label = t if isinstance(t, str) else "memory"
        raw_date = md.get("date") if isinstance(md, dict) else None
        date_str = raw_date if isinstance(raw_date, str) else ""
        content = match.get("content")
        text = content if isinstance(content, str) else ""
        when = f" ({date_str})" if date_str else ""
        lines.append(f"[{i}] {type_label}{when}: {text}")
    return "\n".join(lines)


def _coerce_source_score(raw: Any) -> float | None:
    if isinstance(raw, bool):
        return None
    if isinstance(raw, (int, float)):
        return float(raw)
    return None


def matches_to_sources(matches: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Build API-facing citation objects from internal Pinecone match dicts."""
    sources: List[Dict[str, Any]] = []
    for idx, match in enumerate(matches):
        md = match.get("metadata") if isinstance(match.get("metadata"), dict) else {}
        raw_type = md.get("type")
        type_label = raw_type if isinstance(raw_type, str) and raw_type.strip() else "memory"
        raw_date = md.get("date")
        date_str = raw_date if isinstance(raw_date, str) and raw_date.strip() else None
        content = match.get("content")
        text = content if isinstance(content, str) else ""
        vector_id = match.get("id")
        source_id = vector_id if isinstance(vector_id, str) and vector_id.strip() else f"match-{idx}"
        sources.append(
            {
                "index": idx + 1,
                "id": source_id,
                "type": type_label,
                "date": date_str,
                "snippet": text[:SOURCE_SNIPPET_MAX_CHARS],
                "score": _coerce_source_score(match.get("score")),
            }
        )
    return sources


def _build_system_prompt(
    *,
    assistant_facts: Dict[str, Any],
    context_json: str,
    rag_block: str,
    history_lines: str,
    user_message: str,
) -> tuple[str, str]:
    facts_s = json.dumps(assistant_facts, ensure_ascii=False, indent=2)
    return render_chat_system_prompt(
        facts_json=facts_s,
        context_json=context_json,
        rag_block=rag_block,
        history_lines=history_lines,
        user_message=user_message,
    )


@chat_routes.route("/api/chat-assistant", methods=["POST"])
def chat_assistant():
    try:
        auth_header = request.headers.get("Authorization")
        try:
            uid, email_verified = verify_bearer_uid_and_email_verified(auth_header)
        except ValueError:
            return jsonify({"error": "unauthorized"}), 401
        except Exception as e:
            logger.warning("Auth verify failed: %s", e)
            return jsonify({"error": "unauthorized"}), 401

        if not email_verified:
            return jsonify({"error": "email_not_verified"}), 403

        payload = request.get_json(silent=True) or {}
        raw_message = payload.get("message")
        if not isinstance(raw_message, str) or not raw_message.strip():
            return jsonify({"error": "message required"}), 400

        message, history = _sanitize_chat_payload(raw_message, payload.get("conversationHistory"))
        if not message:
            return jsonify({"error": "message required"}), 400

        ip = _client_ip()
        rate_err = _check_rate(uid, ip)
        if rate_err is not None:
            body, code = rate_err
            return jsonify(body), code

        with chat_trace_session(
            uid=uid,
            message=message,
            history_turns=len(history),
        ) as trace:
            init_firebase_admin()
            db = firestore.Client()
            snap = db.collection("users").document(uid).get()
            if not snap.exists:
                trace.fail(status_code=404, error="user_not_found")
                return jsonify({"error": "user_not_found"}), 404

            user_doc = snap.to_dict() or {}
            facts = build_assistant_facts(user_doc)
            context_json = prompt_context_json(user_doc)

            use_rag = needs_semantic_retrieval(message)
            retrieve_k, prompt_k = rag_k_limits()
            matches: List[Dict[str, Any]] = []
            prompt_matches: List[Dict[str, Any]] = []
            rerank_applied = False
            if use_rag:
                matches = _pinecone_matches_for_user(uid, message, top_k=retrieve_k)
                prompt_matches, rerank_applied = rerank_pinecone_matches(
                    message, matches, top_n=prompt_k
                )

            grounding_mode = resolve_grounding_mode(
                rag_requested=use_rag,
                has_prompt_matches=bool(prompt_matches),
            )
            if use_rag and prompt_matches:
                rag_block = _format_numbered_rag_block(prompt_matches)
            else:
                rag_block = rag_block_for_grounding(
                    rag_requested=use_rag,
                    has_matches=bool(prompt_matches),
                )
            history_lines = "\n".join(f'{h["role"]}: {h["content"]}' for h in history) or "(none)"

            prompt, prompt_version = _build_system_prompt(
                assistant_facts=facts,
                context_json=context_json,
                rag_block=rag_block,
                history_lines=history_lines,
                user_message=message,
            )

            _log_built_prompt(
                uid=uid,
                prompt=prompt,
                user_message=message,
                context_json=context_json,
                rag_block=rag_block,
                history_lines=history_lines,
                use_rag=use_rag,
                match_count=len(prompt_matches),
                history_turns=len(history),
            )
            logger.info(
                "chat_assistant grounding uid=%s mode=%s rag_requested=%s prompt_match_count=%d",
                uid,
                grounding_mode,
                use_rag,
                len(prompt_matches),
            )

            meta = {
                "promptVersion": prompt_version,
                "usedRag": bool(use_rag and prompt_matches),
                "ragRequested": use_rag,
                "sourceCount": len(sources) if use_rag else 0,
                "retrieveCount": len(matches) if use_rag else 0,
                "ragRetrieveK": retrieve_k if use_rag else 0,
                "ragPromptK": prompt_k if use_rag else 0,
                "rerankEnabled": bool(use_rag and rerank_applied),
                "rerankConfigured": rerank_enabled(),
                "citationsEnabled": bool(use_rag and prompt_matches),
                "groundingMode": grounding_mode,
            }
            trace.update_pipeline(**meta, model=chat_model_name())

            try:
                reply = trace.record_generation(
                    model=chat_model_name(),
                    prompt_version=prompt_version,
                    prompt_chars=len(prompt),
                    call=lambda: generate_chat_reply(prompt),
                )
            except RuntimeError as e:
                logger.warning("Gemini chat failed: %s", e)
                trace.fail(status_code=503, error=str(e))
                return jsonify({"error": "model_unavailable", "detail": str(e)}), 503

            sources = matches_to_sources(prompt_matches) if use_rag else []
            meta["sourceCount"] = len(sources)
            trace.succeed(meta=meta, reply_chars=len(reply))

            return jsonify(
                {
                    "reply": reply,
                    "sources": sources,
                    "meta": meta,
                }
            )
    except Exception as e:
        logger.exception("chat_assistant failed: %s", e)
        return jsonify({"error": "internal_error", "detail": str(e)}), 500
