"""Server-side Gemini: embeddings (Pinecone) + chat completions."""

from __future__ import annotations

import logging
import os
from typing import List

from google import genai
from google.genai import types

logger = logging.getLogger(__name__)

_EMBED_MODEL = "gemini-embedding-001"
_CHAT_MODEL = "gemini-2.5-flash-lite"


def _api_key() -> str:
    return (os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY") or "").strip()


def _client() -> genai.Client:
    key = _api_key()
    if not key:
        raise RuntimeError("GEMINI_API_KEY is not configured")
    return genai.Client(api_key=key)


def embed_query_text(text: str) -> List[float]:
    """768-dim query embedding for Pinecone RAG (matches index / client embed dimension)."""
    try:
        client = _client()
        result = client.models.embed_content(
            model=_EMBED_MODEL,
            contents=text,
            config=types.EmbedContentConfig(
                task_type="RETRIEVAL_QUERY",
                output_dimensionality=768,
            ),
        )
    except Exception as e:
        logger.warning("Gemini embed failed: %s", e)
        raise RuntimeError("embedding_failed") from e

    if not result.embeddings:
        raise RuntimeError("embedding_failed")
    emb = result.embeddings[0].values
    if isinstance(emb, list) and emb:
        return [float(x) for x in emb]

    raise RuntimeError("embedding_failed")


def generate_chat_reply(prompt: str) -> str:
    client = _client()
    resp = client.models.generate_content(
        model=_CHAT_MODEL,
        contents=prompt,
        config=types.GenerateContentConfig(
            temperature=0.7,
            max_output_tokens=350,
            top_k=40,
            top_p=0.95,
        ),
    )
    text = getattr(resp, "text", None)
    if isinstance(text, str) and text.strip():
        return text.strip()

    try:
        cand = resp.candidates[0]
        parts = cand.content.parts
        out = "".join(getattr(p, "text", "") for p in parts)
        if out.strip():
            return out.strip()
    except Exception as e:
        logger.warning("Gemini reply parse failed: %s", e)

    raise RuntimeError("empty_model_response")
