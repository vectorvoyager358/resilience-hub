"""Optional Langfuse tracing for /api/chat-assistant (#83).

Disabled when LANGFUSE_PUBLIC_KEY / LANGFUSE_SECRET_KEY are unset, or LANGFUSE_DISABLED=1.
Does not record full prompts or user message text (PII-safe hashes and counts only).
"""

from __future__ import annotations

import hashlib
import logging
import os
import sys
import time
from contextlib import contextmanager
from typing import Any, Callable, Iterator, TypeVar

logger = logging.getLogger(__name__)

T = TypeVar("T")

_TRACE_META_KEYS = (
    "promptVersion",
    "ragRequested",
    "usedRag",
    "groundingMode",
    "sourceCount",
    "retrieveCount",
    "rerankEnabled",
    "rerankConfigured",
    "citationsEnabled",
)


def hash_text(text: str) -> str:
    """Stable short digest for trace I/O without storing raw text."""
    return hashlib.sha256(text.encode("utf-8")).hexdigest()[:16]


def _env_truthy(key: str) -> bool:
    return (os.environ.get(key) or "").strip().lower() in ("1", "true", "yes", "on")


def langfuse_tracing_configured() -> bool:
    """True when Langfuse keys are present and tracing is not explicitly disabled."""
    if _env_truthy("LANGFUSE_DISABLED"):
        return False
    pub = (os.environ.get("LANGFUSE_PUBLIC_KEY") or "").strip()
    sec = (os.environ.get("LANGFUSE_SECRET_KEY") or "").strip()
    return bool(pub and sec)


_langfuse_client: Any | None = None
_langfuse_import_failed = False


def reset_langfuse_client_for_tests() -> None:
    """Clear cached client (unit tests only)."""
    global _langfuse_client, _langfuse_import_failed
    _langfuse_client = None
    _langfuse_import_failed = False


def _get_langfuse_client() -> Any | None:
    """Lazy singleton; returns None when tracing is off or Langfuse is unavailable."""
    global _langfuse_client, _langfuse_import_failed
    if _langfuse_import_failed or not langfuse_tracing_configured():
        return None
    if _langfuse_client is not None:
        return _langfuse_client
    try:
        from langfuse import Langfuse

        host = (
            (os.environ.get("LANGFUSE_HOST") or os.environ.get("LANGFUSE_BASE_URL") or "")
            .strip()
        )
        kwargs: dict[str, Any] = {
            "public_key": os.environ["LANGFUSE_PUBLIC_KEY"].strip(),
            "secret_key": os.environ["LANGFUSE_SECRET_KEY"].strip(),
        }
        if host:
            kwargs["host"] = host
        client = Langfuse(**kwargs)
        if getattr(client, "_tracing_enabled", True) is False:
            return None
        _langfuse_client = client
        return _langfuse_client
    except Exception as e:
        _langfuse_import_failed = True
        logger.warning("Langfuse tracing disabled (init failed): %s", e)
        return None


@contextmanager
def noop_trace_stage(_name: str, **_metadata: Any) -> Iterator[None]:
    """No-op stage context for callers without an active Langfuse trace."""
    yield


class _NoOpChatTrace:
    """Zero-overhead stand-in when Langfuse is disabled."""

    def update_pipeline(self, **_kwargs: Any) -> None:
        return None

    @contextmanager
    def stage(self, name: str, **metadata: Any) -> Iterator[None]:
        if _env_truthy("CHAT_LOG_STAGE_TIMINGS"):
            start = time.perf_counter()
            try:
                yield
            finally:
                duration_ms = int((time.perf_counter() - start) * 1000)
                logger.info(
                    "chat_assistant stage=%s duration_ms=%d metadata=%s",
                    name,
                    duration_ms,
                    metadata or {},
                )
        else:
            yield

    def record_generation(
        self,
        *,
        model: str,
        prompt_version: str,
        prompt_chars: int,
        call: Callable[[], T],
    ) -> T:
        return call()

    def succeed(self, *, meta: dict[str, Any], reply_chars: int) -> None:
        return None

    def fail(self, *, status_code: int, error: str) -> None:
        return None


class _ActiveChatTrace:
    def __init__(self, root_span: Any) -> None:
        self._root = root_span

    def update_pipeline(self, **kwargs: Any) -> None:
        if kwargs:
            self._root.update(metadata=kwargs)

    @contextmanager
    def stage(self, name: str, **metadata: Any) -> Iterator[Any]:
        start = time.perf_counter()
        with self._root.start_as_current_observation(
            name=name,
            as_type="span",
            metadata=metadata or None,
        ) as span:
            try:
                yield span
            finally:
                duration_ms = int((time.perf_counter() - start) * 1000)
                span.update(output={"durationMs": duration_ms})
                if _env_truthy("CHAT_LOG_STAGE_TIMINGS"):
                    logger.info(
                        "chat_assistant stage=%s duration_ms=%d metadata=%s",
                        name,
                        duration_ms,
                        metadata or {},
                    )

    def record_generation(
        self,
        *,
        model: str,
        prompt_version: str,
        prompt_chars: int,
        call: Callable[[], T],
    ) -> T:
        with self._root.start_as_current_observation(
            name="gemini-chat",
            as_type="generation",
            model=model,
            input={
                "promptVersion": prompt_version,
                "promptChars": prompt_chars,
            },
            metadata={"promptVersion": prompt_version},
        ) as generation:
            result = call()
            reply = result if isinstance(result, str) else str(result)
            generation.update(
                output={
                    "replyChars": len(reply),
                    "replySha256": hash_text(reply),
                }
            )
            return result

    def succeed(self, *, meta: dict[str, Any], reply_chars: int) -> None:
        trace_meta = {k: meta[k] for k in _TRACE_META_KEYS if k in meta}
        self._root.update(
            output={"status": "ok", "replyChars": reply_chars},
            metadata=trace_meta,
        )

    def fail(self, *, status_code: int, error: str) -> None:
        self._root.update(
            output={"status": "error", "httpStatus": status_code},
            level="ERROR",
            status_message=error[:500],
        )


@contextmanager
def chat_trace_session(
    *,
    uid: str,
    message: str,
    history_turns: int,
) -> Iterator[_NoOpChatTrace | _ActiveChatTrace]:
    """One Langfuse trace per successful chat pipeline (after auth + validation)."""
    client = _get_langfuse_client()
    if client is None:
        yield _NoOpChatTrace()
        return

    try:
        from langfuse import propagate_attributes
    except Exception as e:
        logger.warning("Langfuse unavailable (chat continues): %s", e)
        yield _NoOpChatTrace()
        return

    obs_ctx = client.start_as_current_observation(
        name="chat-assistant",
        as_type="span",
        input={
            "messageSha256": hash_text(message),
            "messageChars": len(message),
            "historyTurns": history_turns,
        },
        metadata={"service": "resilience-hub"},
    )
    prop_ctx = propagate_attributes(
        user_id=uid,
        metadata={"historyTurns": str(history_turns)},
    )
    root = None
    try:
        root = obs_ctx.__enter__()
        prop_ctx.__enter__()
    except Exception as e:
        logger.warning("Langfuse trace setup failed (chat continues): %s", e)
        if root is not None:
            obs_ctx.__exit__(type(e), e, e.__traceback__)
        yield _NoOpChatTrace()
        return

    try:
        yield _ActiveChatTrace(root)
    finally:
        exc_info = sys.exc_info()
        try:
            client.flush()
        except Exception as e:
            logger.warning("Langfuse flush failed: %s", e)
        try:
            prop_ctx.__exit__(*exc_info)
            obs_ctx.__exit__(*exc_info)
        except Exception as e:
            logger.warning("Langfuse trace teardown failed: %s", e)
