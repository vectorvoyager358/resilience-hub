"""Rerank Pinecone matches with Cohere Rerank API (#73)."""

from __future__ import annotations

import logging
import os
from typing import Any, Dict, List

logger = logging.getLogger(__name__)

_DEFAULT_MODEL = "rerank-v3.5"


def _cohere_api_key() -> str:
    return (os.environ.get("COHERE_API_KEY") or "").strip()


def rerank_enabled() -> bool:
    key = _cohere_api_key()
    raw = (os.environ.get("RERANK_ENABLED") or "").strip().lower()
    if raw in ("0", "false", "no", "off"):
        return False
    if raw in ("1", "true", "yes", "on"):
        return bool(key)
    # Default: on when API key is configured.
    return bool(key)


def rerank_model() -> str:
    return (os.environ.get("RERANK_MODEL") or _DEFAULT_MODEL).strip() or _DEFAULT_MODEL


def _document_text(match: Dict[str, Any]) -> str:
    content = match.get("content")
    if isinstance(content, str) and content.strip():
        return content.strip()[:4000]
    return ""


def rerank_pinecone_matches(
    query: str,
    matches: List[Dict[str, Any]],
    *,
    top_n: int,
) -> tuple[List[Dict[str, Any]], bool]:
    """
    Re-order matches by Cohere relevance. Returns (matches_for_prompt, rerank_applied).

    On failure or when disabled, returns the first top_n matches in Pinecone order.
    """
    if top_n < 1 or not matches:
        return [], False
    if not rerank_enabled():
        return matches[:top_n], False

    q = (query or "").strip()
    if not q:
        return matches[:top_n], False

    doc_indices: List[int] = []
    documents: List[str] = []
    for i, match in enumerate(matches):
        text = _document_text(match)
        if text:
            doc_indices.append(i)
            documents.append(text)

    if not documents:
        return matches[:top_n], False

    try:
        import cohere

        client = cohere.ClientV2(api_key=_cohere_api_key())
        response = client.rerank(
            model=rerank_model(),
            query=q,
            documents=documents,
            top_n=min(top_n, len(documents)),
        )
    except Exception as e:
        logger.warning("Cohere rerank failed, using Pinecone order: %s", e)
        return matches[:top_n], False

    ranked: List[Dict[str, Any]] = []
    seen: set[int] = set()
    for item in getattr(response, "results", []) or []:
        doc_idx = getattr(item, "index", None)
        if not isinstance(doc_idx, int) or doc_idx < 0 or doc_idx >= len(doc_indices):
            continue
        orig_i = doc_indices[doc_idx]
        seen.add(orig_i)
        out = dict(matches[orig_i])
        score = getattr(item, "relevance_score", None)
        if isinstance(score, (int, float)):
            out["pinecone_score"] = out.get("score")
            out["score"] = float(score)
        ranked.append(out)

    if len(ranked) < top_n:
        for i, match in enumerate(matches):
            if i in seen:
                continue
            ranked.append(dict(match))
            if len(ranked) >= top_n:
                break

    return ranked[:top_n], True
