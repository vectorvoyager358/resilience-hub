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
from server.gemini_client import generate_chat_reply
from server.intent_chat import needs_semantic_retrieval
from server.rate_limit import TokenBucketLimiter

logger = logging.getLogger(__name__)

chat_routes = Blueprint("chat", __name__)

MAX_USER_MESSAGE_CHARS = 4000
MAX_HISTORY_TURNS = 14
MAX_HISTORY_CONTENT_CHARS = 8000

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


def _pinecone_matches_for_user(uid: str, query_text: str, top_k: int = 8) -> List[Dict[str, Any]]:
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
            matches.append(
                {
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


def _format_rag_lines(matches: List[Dict[str, Any]]) -> str:
    lines: List[str] = []
    for match in matches:
        md = match.get("metadata") or {}
        t = md.get("type") if isinstance(md, dict) else None
        type_label = t if isinstance(t, str) else "memory"
        raw_date = md.get("date") if isinstance(md, dict) else None
        date_str = raw_date if isinstance(raw_date, str) else ""
        content = match.get("content")
        text = content if isinstance(content, str) else ""
        when = f" ({date_str})" if date_str else ""
        lines.append(f"- {type_label}: {text}{when}")
    return "\n".join(lines) if lines else "(No matching indexed memories.)"


def _build_system_prompt(
    *,
    assistant_facts: Dict[str, Any],
    context_json: str,
    rag_block: str,
    history_lines: str,
    user_message: str,
) -> str:
    facts_s = json.dumps(assistant_facts, ensure_ascii=False, indent=2)
    return f"""You are a personal resilience coach assistant.

Rules:
- For counts, totals, breakdowns (active vs archived, daily vs weekly cadence, reflection days), use ONLY the "Authoritative facts" JSON below. Never infer counts from retrieved memories.
- For questions about **active** challenges (how many active, list active, duration for each active challenge), use ONLY `challenges.challengeLists.active` and `challenges.activeCount`. The length of `challengeLists.active` MUST equal `activeCount`. Do NOT list challenges from `challengeLists.archived` or from Rich context for an "active-only" answer.
- For **all** challenges (including ended), you may use both `challengeLists.active` and `challengeLists.archived` plus counts—but only when the user asks for everything / archived too / total list.
- Per-challenge **planned duration** for factual answers must come from `durationSummary` / `plannedSlots` / `totalCalendarDaysInPlannedWindow` inside those challenge list entries—not from memory or Rich context alone.
- Retrieved memories may be incomplete (top-K search). Use them for themes, wording, and recall of past notes—not for statistics.
- If memories are empty, rely on facts + rich context; do not invent past journal content.
- Rich context lists challenge rows with notes for narrative color only. For ANY factual question about counts, active vs archived, lists, or durations, trust ONLY Authoritative facts (`challengeLists`, counts)—never enumerate “all challenges” from Rich context alone.
- Rich context lists each challenge with `challengeStatus` ("active" | "archived") and `calendarWindowEnded` (boolean). For ANY challenge where `challengeStatus` is "archived", do NOT treat it as ongoing tracking—do not advise logging further days in that challenge window or imply they should "keep going" on that same timed challenge. Acknowledge it ended; answer with reflection, lessons, habits to carry forward, or starting a new challenge if appropriate.
- When the user names a challenge, match it to the Rich context entry by name and respect that entry's `challengeStatus`.
- Keep responses under 220 words, warm and encouraging.
- Do not give medical or clinical diagnoses; encourage professional help for crises.

Authoritative facts (use for ALL numeric/statistical answers):
{facts_s}

Rich context (challenge names, recent note previews — may overlap with memories):
{context_json}

Retrieved memories (semantic search — optional):
{rag_block}

Recent conversation:
{history_lines}

User message:
{user_message}
"""


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

        init_firebase_admin()
        db = firestore.Client()
        snap = db.collection("users").document(uid).get()
        if not snap.exists:
            return jsonify({"error": "user_not_found"}), 404

        user_doc = snap.to_dict() or {}
        facts = build_assistant_facts(user_doc)
        context_json = prompt_context_json(user_doc)

        use_rag = needs_semantic_retrieval(message)
        matches: List[Dict[str, Any]] = []
        if use_rag:
            matches = _pinecone_matches_for_user(uid, message)

        rag_block = _format_rag_lines(matches)
        history_lines = "\n".join(f'{h["role"]}: {h["content"]}' for h in history) or "(none)"

        prompt = _build_system_prompt(
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
            match_count=len(matches),
            history_turns=len(history),
        )

        try:
            reply = generate_chat_reply(prompt)
        except RuntimeError as e:
            logger.warning("Gemini chat failed: %s", e)
            return jsonify({"error": "model_unavailable", "detail": str(e)}), 503

        return jsonify(
            {
                "reply": reply,
                "meta": {
                    "usedRag": bool(use_rag and matches),
                    "ragRequested": use_rag,
                },
            }
        )
    except Exception as e:
        logger.exception("chat_assistant failed: %s", e)
        return jsonify({"error": "internal_error", "detail": str(e)}), 500
