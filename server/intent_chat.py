"""Lightweight routing: when semantic retrieval (RAG) helps vs facts-only."""

from __future__ import annotations

import re

# Strong signals for aggregate / factual questions — skip RAG to avoid wrong "top-k" answers.
_FACT_PRIMARY = re.compile(
    r"\b("
    r"how\s+many|total\s+(number|count)|count\b|breakdown|statistics|"
    r"active\s+and\s+archived|weekly\s+and\s+daily|by\s+cadence|"
    r"percent|percentage|\d+\s*%\s*complete|"
    r"each\s+challenge|every\s+challenge|all\s+(my\s+)?challenges|list\s+(of\s+)?my\s+challenges|"
    r"duration\s+(for|of)|planned\s+duration|how\s+long\s+(is|are)"
    r")\b",
    re.I,
)

# Recall / narrative memory — use RAG when available.
_MEMORY = re.compile(
    r"\b("
    r"what\s+did\s+i\s+(write|say|note)|what\s+have\s+i\s+written|"
    r"when\s+did\s+i|summarize\s+(my|the)|remember\s+(when|what|if)|"
    r"wrote\s+about|reflections?\s+about|my\s+(notes|journal)|"
    r"notes\s+about|last\s+time\s+i|past\s+(week|month)|"
    r"feel\s+about|themes?\s+in"
    r")\b",
    re.I,
)


def needs_semantic_retrieval(message: str) -> bool:
    m = (message or "").strip()
    if not m:
        return False
    if _FACT_PRIMARY.search(m) and not _MEMORY.search(m):
        return False
    if _MEMORY.search(m):
        return True
    return False
