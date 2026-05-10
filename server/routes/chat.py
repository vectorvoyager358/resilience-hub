"""Authenticated chat assistant: Firestore facts + optional Pinecone RAG + Gemini."""

from __future__ import annotations

import json
import logging
from typing import Any, Dict, List

from flask import Blueprint, jsonify, request
from google.cloud import firestore

from server.assistant_facts import build_assistant_facts
from server.chat_context import prompt_context_json
from server.firebase_util import init_firebase_admin, verify_bearer_uid
from server.gemini_client import generate_chat_reply
from server.intent_chat import needs_semantic_retrieval

logger = logging.getLogger(__name__)

chat_routes = Blueprint("chat", __name__)


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
- Retrieved memories may be incomplete (top-K search). Use them for themes, wording, and recall of past notes—not for statistics.
- If memories are empty, rely on facts + rich context; do not invent past journal content.
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
            uid = verify_bearer_uid(auth_header)
        except ValueError:
            return jsonify({"error": "unauthorized"}), 401
        except Exception as e:
            logger.warning("Auth verify failed: %s", e)
            return jsonify({"error": "unauthorized"}), 401

        payload = request.get_json(silent=True) or {}
        message = payload.get("message")
        if not isinstance(message, str) or not message.strip():
            return jsonify({"error": "message required"}), 400

        history_raw = payload.get("conversationHistory")
        history: List[Dict[str, str]] = []
        if isinstance(history_raw, list):
            for item in history_raw[-12:]:
                if not isinstance(item, dict):
                    continue
                role = item.get("role")
                content = item.get("content")
                if role in ("user", "assistant") and isinstance(content, str) and content.strip():
                    history.append({"role": role, "content": content.strip()})

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
            matches = _pinecone_matches_for_user(uid, message.strip())

        rag_block = _format_rag_lines(matches)
        history_lines = "\n".join(f'{h["role"]}: {h["content"]}' for h in history) or "(none)"

        prompt = _build_system_prompt(
            assistant_facts=facts,
            context_json=context_json,
            rag_block=rag_block,
            history_lines=history_lines,
            user_message=message.strip(),
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
