"""Split long text for Pinecone indexing (#76).

Uses character counts as a token proxy (~4 chars/token). Defaults align with
docs/rag-indexing.md: ~500–800 tokens per chunk, ~100-token overlap.
"""

from __future__ import annotations

import os
import re

# ~500 tokens at 4 chars/token
_DEFAULT_TARGET_CHARS = 2000
# ~100 tokens overlap
_DEFAULT_OVERLAP_CHARS = 400
# Only split when above ~500 tokens
_DEFAULT_THRESHOLD_CHARS = 2000
MAX_INDEX_CHUNKS = 32


def _parse_positive_int(key: str, default: int) -> int:
    raw = (os.environ.get(key) or "").strip()
    if not raw:
        return default
    try:
        n = int(raw)
    except ValueError:
        return default
    return n if n > 0 else default


def chunking_config() -> tuple[int, int, int]:
    """Return (threshold_chars, target_chars, overlap_chars)."""
    target = _parse_positive_int("RAG_CHUNK_TARGET_CHARS", _DEFAULT_TARGET_CHARS)
    overlap = _parse_positive_int("RAG_CHUNK_OVERLAP_CHARS", _DEFAULT_OVERLAP_CHARS)
    threshold = _parse_positive_int("RAG_CHUNK_THRESHOLD_CHARS", _DEFAULT_THRESHOLD_CHARS)
    if overlap >= target:
        overlap = max(1, target // 5)
    return threshold, target, overlap


def _break_before_boundary(text: str, end: int, *, min_pos: int) -> int:
    """Move `end` left to a paragraph/sentence boundary when possible."""
    if end >= len(text):
        return end
    window = text[:end]
    best = -1
    for sep in ("\n\n", "\n", ". ", "? ", "! "):
        idx = window.rfind(sep)
        if idx >= min_pos:
            best = max(best, idx + len(sep))
    return best if best > min_pos else end


def split_text_for_indexing(
    text: str,
    *,
    threshold_chars: int | None = None,
    target_chars: int | None = None,
    overlap_chars: int | None = None,
) -> list[str]:
    """
    Split `text` into chunks for embedding. Short text returns a single chunk.
    """
    normalized = re.sub(r"\r\n?", "\n", (text or "").strip())
    if not normalized:
        return []

    th, tgt, ov = chunking_config()
    if threshold_chars is not None:
        th = threshold_chars
    if target_chars is not None:
        tgt = target_chars
    if overlap_chars is not None:
        ov = overlap_chars

    if len(normalized) <= th:
        return [normalized]

    chunks: list[str] = []
    start = 0
    while start < len(normalized) and len(chunks) < MAX_INDEX_CHUNKS:
        end = min(start + tgt, len(normalized))
        if end < len(normalized):
            end = _break_before_boundary(normalized, end, min_pos=start + tgt // 2)
        piece = normalized[start:end].strip()
        if piece:
            chunks.append(piece)
        if end >= len(normalized):
            break
        next_start = end - ov
        if next_start <= start:
            next_start = end
        start = next_start

    return chunks if chunks else [normalized]
