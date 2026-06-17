"""Langfuse tracing helpers (#83) — no live Langfuse network calls."""

from __future__ import annotations

import os
import unittest
from contextlib import contextmanager
from unittest.mock import MagicMock, patch

from server.langfuse_tracing import (
    chat_trace_session,
    hash_text,
    langfuse_tracing_configured,
    reset_langfuse_client_for_tests,
)


class HashTextTest(unittest.TestCase):
    def test_stable_digest(self):
        self.assertEqual(hash_text("hello"), hash_text("hello"))
        self.assertEqual(len(hash_text("hello")), 16)

    def test_differs_for_different_input(self):
        self.assertNotEqual(hash_text("a"), hash_text("b"))


class LangfuseConfiguredTest(unittest.TestCase):
    def setUp(self):
        reset_langfuse_client_for_tests()

    def test_false_when_keys_missing(self):
        with patch.dict(os.environ, {}, clear=True):
            self.assertFalse(langfuse_tracing_configured())

    def test_true_when_keys_present(self):
        env = {
            "LANGFUSE_PUBLIC_KEY": "pk-test",
            "LANGFUSE_SECRET_KEY": "sk-test",
        }
        with patch.dict(os.environ, env, clear=True):
            self.assertTrue(langfuse_tracing_configured())

    def test_disabled_flag(self):
        env = {
            "LANGFUSE_PUBLIC_KEY": "pk-test",
            "LANGFUSE_SECRET_KEY": "sk-test",
            "LANGFUSE_DISABLED": "1",
        }
        with patch.dict(os.environ, env, clear=True):
            self.assertFalse(langfuse_tracing_configured())


class ChatTraceSessionTest(unittest.TestCase):
    def setUp(self):
        reset_langfuse_client_for_tests()

    def test_noop_when_unconfigured(self):
        with patch.dict(os.environ, {}, clear=True):
            with chat_trace_session(uid="u1", message="hi", history_turns=0) as trace:
                out = trace.record_generation(
                    model="test-model",
                    prompt_version="chat_v1",
                    prompt_chars=10,
                    call=lambda: "reply",
                )
                trace.succeed(meta={"promptVersion": "chat_v1"}, reply_chars=5)
        self.assertEqual(out, "reply")

    def test_active_trace_records_generation_and_metadata(self):
        root_span = MagicMock()
        generation_cm = MagicMock()
        generation_span = MagicMock()
        generation_cm.__enter__ = MagicMock(return_value=generation_span)
        generation_cm.__exit__ = MagicMock(return_value=False)
        root_span.start_observation.return_value = generation_cm

        client = MagicMock()
        client._tracing_enabled = True
        client.flush = MagicMock()

        @contextmanager
        def fake_propagate(**_kwargs):
            yield

        @contextmanager
        def fake_root(**kwargs):
            self.assertEqual(kwargs.get("name"), "chat-assistant")
            inp = kwargs.get("input") or {}
            self.assertEqual(inp.get("messageSha256"), hash_text("what did I write"))
            self.assertNotIn("what did I write", str(inp))
            yield root_span

        client.propagate_attributes = fake_propagate
        client.start_as_current_observation = fake_root

        env = {
            "LANGFUSE_PUBLIC_KEY": "pk-test",
            "LANGFUSE_SECRET_KEY": "sk-test",
        }
        with patch.dict(os.environ, env, clear=True):
            with patch("langfuse.Langfuse", return_value=client):
                with chat_trace_session(
                        uid="uid-abc",
                        message="what did I write",
                        history_turns=2,
                    ) as trace:
                        reply = trace.record_generation(
                            model="gemini-2.5-flash-lite",
                            prompt_version="chat_v1",
                            prompt_chars=1200,
                            call=lambda: "assistant reply",
                        )
                        trace.update_pipeline(
                            ragRequested=True,
                            usedRag=True,
                            promptVersion="chat_v1",
                        )
                        trace.succeed(
                            meta={
                                "promptVersion": "chat_v1",
                                "ragRequested": True,
                                "usedRag": True,
                                "groundingMode": "rag",
                                "sourceCount": 1,
                                "retrieveCount": 3,
                                "rerankEnabled": False,
                                "rerankConfigured": False,
                                "citationsEnabled": True,
                            },
                            reply_chars=len(reply),
                        )

        root_span.start_observation.assert_called_once()
        gen_kwargs = root_span.start_observation.call_args.kwargs
        self.assertEqual(gen_kwargs.get("as_type"), "generation")
        self.assertEqual(gen_kwargs.get("model"), "gemini-2.5-flash-lite")
        self.assertNotIn("assistant reply", str(gen_kwargs.get("input")))
        generation_span.update.assert_called_once()
        gen_out = generation_span.update.call_args.kwargs.get("output") or {}
        self.assertEqual(gen_out.get("replySha256"), hash_text("assistant reply"))
        client.flush.assert_called_once()


if __name__ == "__main__":
    unittest.main()
