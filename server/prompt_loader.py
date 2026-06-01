"""Load versioned chat system prompt templates from server/prompts/."""

from __future__ import annotations

import logging
import os
from functools import lru_cache
from pathlib import Path

logger = logging.getLogger(__name__)

_PROMPTS_DIR = Path(__file__).resolve().parent / "prompts"
_DEFAULT_VERSION = "chat_v1"

_PLACEHOLDER_FACTS = "@@AUTHORITATIVE_FACTS@@"
_PLACEHOLDER_CONTEXT = "@@RICH_CONTEXT@@"
_PLACEHOLDER_RAG = "@@RAG_BLOCK@@"
_PLACEHOLDER_HISTORY = "@@HISTORY@@"
_PLACEHOLDER_USER = "@@USER_MESSAGE@@"


def chat_prompt_version() -> str:
    raw = (os.environ.get("CHAT_PROMPT_VERSION") or _DEFAULT_VERSION).strip()
    return raw or _DEFAULT_VERSION


@lru_cache(maxsize=4)
def _load_template(version: str) -> str:
    path = _PROMPTS_DIR / f"{version}.txt"
    if not path.is_file():
        raise FileNotFoundError(f"Chat prompt template not found: {path}")
    return path.read_text(encoding="utf-8")


def render_chat_system_prompt(
    *,
    facts_json: str,
    context_json: str,
    rag_block: str,
    history_lines: str,
    user_message: str,
) -> tuple[str, str]:
    """Return (full_prompt, prompt_version)."""
    version = chat_prompt_version()
    template = _load_template(version)
    prompt = (
        template.replace(_PLACEHOLDER_FACTS, facts_json)
        .replace(_PLACEHOLDER_CONTEXT, context_json)
        .replace(_PLACEHOLDER_RAG, rag_block)
        .replace(_PLACEHOLDER_HISTORY, history_lines)
        .replace(_PLACEHOLDER_USER, user_message)
    )
    return prompt, version
