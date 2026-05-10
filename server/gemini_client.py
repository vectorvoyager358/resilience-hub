"""Server-side Gemini: embeddings (Pinecone) + chat completions."""

from __future__ import annotations

import logging
import os
from typing import Any, Dict, List

logger = logging.getLogger(__name__)

_EMBED_MODEL = "models/gemini-embedding-001"
_CHAT_MODEL = "gemini-2.5-flash-lite"


def _api_key() -> str:
    return (os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY") or "").strip()


def embed_query_text(text: str) -> List[float]:
    key = _api_key()
    if not key:
        raise RuntimeError("GEMINI_API_KEY is not configured")

    try:
        import google.generativeai as genai  # type: ignore[import-untyped]

        genai.configure(api_key=key)
        kwargs: Dict[str, Any] = {
            "model": _EMBED_MODEL,
            "content": text,
            "task_type": "retrieval_query",
        }
        # Match Pinecone index dimension (see `/api/delete-pinecone` dummy vector length).
        try:
            result = genai.embed_content(**kwargs, output_dimensionality=768)
        except TypeError:
            result = genai.embed_content(**kwargs)

        emb: Any = None
        if isinstance(result, dict):
            emb = result.get("embedding")
            if isinstance(emb, dict) and "values" in emb:
                emb = emb.get("values")
        elif hasattr(result, "embedding"):
            inner = getattr(result, "embedding", None)
            if hasattr(inner, "values"):
                emb = list(inner.values)

        if isinstance(emb, list) and emb:
            return [float(x) for x in emb]
    except Exception as e:
        logger.warning("Gemini embed failed: %s", e)

    raise RuntimeError("embedding_failed")


def generate_chat_reply(prompt: str) -> str:
    key = _api_key()
    if not key:
        raise RuntimeError("GEMINI_API_KEY is not configured")

    import google.generativeai as genai  # type: ignore[import-untyped]

    genai.configure(api_key=key)
    model = genai.GenerativeModel(_CHAT_MODEL)
    resp = model.generate_content(
        prompt,
        generation_config={
            "temperature": 0.7,
            "max_output_tokens": 350,
            "top_k": 40,
            "top_p": 0.95,
        },
    )
    text = getattr(resp, "text", None)
    if isinstance(text, str) and text.strip():
        return text.strip()

    # Fallback: candidates path
    try:
        cand = resp.candidates[0]
        parts = cand.content.parts
        out = "".join(getattr(p, "text", "") for p in parts)
        if out.strip():
            return out.strip()
    except Exception as e:
        logger.warning("Gemini reply parse failed: %s", e)

    raise RuntimeError("empty_model_response")
