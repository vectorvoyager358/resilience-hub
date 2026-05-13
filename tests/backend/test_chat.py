"""Tests for the chat assistant route and supporting logic.

Coverage:
  1. needs_semantic_retrieval() — RAG routing for a golden set of prompts.
  2. _sanitize_chat_payload()   — input truncation and history capping.
  3. /api/chat-assistant        — auth (401), email gate (403), rate limit (429).
     All endpoint tests stub out Firebase, Firestore, and Gemini so no live
     network calls are made.
"""

from __future__ import annotations

import importlib
import os
import sys
import types
import unittest
from datetime import date
from unittest.mock import MagicMock, patch
from zoneinfo import ZoneInfo


# ---------------------------------------------------------------------------
# Minimal stubs needed to import the Flask app without real dependencies
# ---------------------------------------------------------------------------

os.environ.setdefault("ALLOWED_ORIGINS", "https://client.example")
os.environ.setdefault("PINECONE_API_KEY", "test-key")
os.environ.setdefault("PINECONE_INDEX_NAME", "test-index")
# Give the chat limiter large buckets so rate-limit tests can control them
# explicitly via the limiter objects rather than env math.
os.environ.setdefault("CHAT_UID_RATE_CAPACITY", "100")
os.environ.setdefault("CHAT_UID_RATE_REFILL_PER_SEC", "100")
os.environ.setdefault("CHAT_IP_RATE_CAPACITY", "100")
os.environ.setdefault("CHAT_IP_RATE_REFILL_PER_SEC", "100")


class _FakePineconeIndex:
    def query(self, **_kw):
        return types.SimpleNamespace(matches=[])


class _FakePinecone:
    def __init__(self, *_a, **_kw):
        pass

    def Index(self, *_a, **_kw):
        return _FakePineconeIndex()


_app_module = None  # cached after first load


def _load_app():
    """Load the Flask app once per process with the Pinecone stub pre-injected.

    Caches the result so that the exact same module objects are used across all
    test classes — this keeps patch() target strings stable.
    """
    global _app_module
    if _app_module is not None:
        return _app_module

    # Stub pinecone before any server.* module imports it.
    sys.modules.setdefault("pinecone", types.SimpleNamespace(Pinecone=_FakePinecone))

    _app_module = importlib.import_module("server.app")

    import server.routes.pinecone as pc_mod
    pc_mod._index_singleton = _FakePineconeIndex()

    return _app_module


# ===========================================================================
# 1. RAG routing — needs_semantic_retrieval()
# ===========================================================================

class RagRoutingTest(unittest.TestCase):
    """Golden-set table test: verifies which prompts do / don't trigger RAG."""

    def setUp(self):
        from server.intent_chat import needs_semantic_retrieval
        self.rag = needs_semantic_retrieval

    # --- should trigger RAG ---

    def test_what_did_i_write(self):
        self.assertTrue(self.rag("What did I write about my setbacks last time?"))

    def test_what_did_i_say(self):
        self.assertTrue(self.rag("What did I say about my sleep challenge?"))

    def test_summarize_my_notes(self):
        self.assertTrue(self.rag("Summarize my notes from the past week."))

    def test_remember_when(self):
        self.assertTrue(self.rag("Remember when I struggled with meditation?"))

    def test_themes_in_journal(self):
        self.assertTrue(self.rag("What are the themes in my journal?"))

    def test_last_time_i(self):
        self.assertTrue(self.rag("What happened last time I skipped a day?"))

    def test_reflections_about(self):
        self.assertTrue(self.rag("What are my reflections about stress?"))

    def test_feel_about(self):
        self.assertTrue(self.rag("How do I feel about my progress?"))

    def test_my_journal(self):
        self.assertTrue(self.rag("Show me my journal entries."))

    def test_what_have_i_written(self):
        self.assertTrue(self.rag("What have I written about running?"))

    # --- should NOT trigger RAG ---

    def test_how_many_challenges(self):
        self.assertFalse(self.rag("How many challenges do I have?"))

    def test_total_count(self):
        self.assertFalse(self.rag("What is the total count of my challenges?"))

    def test_all_challenges(self):
        self.assertFalse(self.rag("List all my challenges."))

    def test_planned_duration(self):
        self.assertFalse(self.rag("What is the planned duration for my running challenge?"))

    def test_breakdown_by_cadence(self):
        self.assertFalse(self.rag("Give me a breakdown by cadence."))

    def test_percentage_complete(self):
        self.assertFalse(self.rag("What percent complete am I?"))

    def test_active_and_archived(self):
        self.assertFalse(self.rag("Show active and archived challenges."))

    def test_generic_motivation(self):
        self.assertFalse(self.rag("How can I stay motivated?"))

    def test_how_much_yesterday_triggers_rag(self):
        self.assertTrue(
            self.rag("How much did I spend on Instagram yesterday?")
        )

    def test_empty_string(self):
        self.assertFalse(self.rag(""))

    def test_whitespace_only(self):
        self.assertFalse(self.rag("   "))


# ===========================================================================
# 1b. Rich context — challenge note ordering for chat prompts
# ===========================================================================


class ChatContextPayloadTest(unittest.TestCase):
    """build_prompt_context_payload surfaces the newest filled slots first."""

    def test_recent_challenge_notes_are_highest_slots_first(self):
        from server.chat_context import build_prompt_context_payload

        user_doc = {
            "timezone": "UTC",
            "name": "Test",
            "challenges": [
                {
                    "id": "c1",
                    "name": "Insta < 1hr",
                    "startDate": "2026-01-01T12:00:00.000Z",
                    "duration": 30,
                    "cadence": "daily",
                    "completedDays": 2,
                    "notes": {"1": "day one note", "20": "Insta 42m"},
                }
            ],
        }
        payload = build_prompt_context_payload(user_doc)
        self.assertIn("todayLocal", payload)
        self.assertIn("yesterdayLocal", payload)
        notes = payload["challenges"][0]["recentChallengeNotes"]
        self.assertEqual(notes[0]["slot"], "20")
        self.assertEqual(notes[0]["preview"], "Insta 42m")
        self.assertEqual(notes[0].get("localCalendarHint"), "2026-01-20")
        self.assertEqual(payload["challenges"][0].get("startDate"), "2026-01-01T12:00:00.000Z")

    def test_recent_challenge_notes_are_bounded_to_newest_twelve(self):
        from server.chat_context import build_prompt_context_payload

        user_doc = {
            "timezone": "UTC",
            "challenges": [
                {
                    "id": "c1",
                    "name": "Reading",
                    "startDate": "2026-01-01T00:00:00.000Z",
                    "duration": 30,
                    "cadence": "daily",
                    "completedDays": 15,
                    "notes": {str(i): f"note {i}" for i in range(1, 16)},
                }
            ],
        }

        payload = build_prompt_context_payload(user_doc)

        notes = payload["challenges"][0]["recentChallengeNotes"]
        self.assertEqual(len(notes), 12)
        self.assertEqual([note["slot"] for note in notes], [str(i) for i in range(15, 3, -1)])
        self.assertNotIn("3", [note["slot"] for note in notes])

    def test_weekly_note_calendar_hint_uses_local_week_range(self):
        from server.chat_context import build_prompt_context_payload

        tz = ZoneInfo("America/Los_Angeles")
        user_doc = {
            "timezone": "America/Los_Angeles",
            "challenges": [
                {
                    "id": "c1",
                    "name": "Weekly check-in",
                    "startDate": "2026-01-01T02:00:00.000Z",
                    "duration": 4,
                    "cadence": "weekly",
                    "completedDays": 2,
                    "notes": {"2": "second check-in"},
                }
            ],
        }

        with patch(
            "server.chat_context.get_user_timezone_and_today",
            return_value=(tz, date(2026, 1, 10), "America/Los_Angeles"),
        ):
            payload = build_prompt_context_payload(user_doc)

        notes = payload["challenges"][0]["recentChallengeNotes"]
        self.assertEqual(notes[0]["slot"], "2")
        self.assertEqual(notes[0]["localCalendarHint"], "2026-01-07..2026-01-13")


# ===========================================================================
# 2. Input sanitisation — _sanitize_chat_payload()
# ===========================================================================

class SanitizeChatPayloadTest(unittest.TestCase):
    """Verifies message truncation and history capping rules."""

    def setUp(self):
        from server.routes.chat import _sanitize_chat_payload
        self.sanitize = _sanitize_chat_payload

    def test_message_truncated_to_max(self):
        long_msg = "A" * 5000
        msg, _ = self.sanitize(long_msg, [])
        self.assertEqual(len(msg), 4000)

    def test_message_stripped(self):
        msg, _ = self.sanitize("  hello  ", [])
        self.assertEqual(msg, "hello")

    def test_history_capped_to_14_turns(self):
        history = [{"role": "user", "content": f"msg {i}"} for i in range(20)]
        _, hist = self.sanitize("hi", history)
        self.assertLessEqual(len(hist), 14)

    def test_history_takes_last_turns(self):
        history = [{"role": "user", "content": f"msg {i}"} for i in range(20)]
        _, hist = self.sanitize("hi", history)
        # The last 14 items of the original list should be kept
        self.assertEqual(hist[-1]["content"], "msg 19")
        self.assertEqual(hist[0]["content"], "msg 6")

    def test_history_content_truncated(self):
        history = [{"role": "user", "content": "X" * 10000}]
        _, hist = self.sanitize("hi", history)
        self.assertEqual(len(hist[0]["content"]), 8000)

    def test_invalid_history_items_skipped(self):
        history = [
            {"role": "user", "content": "valid"},
            "not a dict",
            {"role": "unknown_role", "content": "bad"},
            {"role": "assistant"},            # missing content
            {"role": "user", "content": "  "},  # blank content
        ]
        _, hist = self.sanitize("hi", history)
        self.assertEqual(len(hist), 1)
        self.assertEqual(hist[0]["content"], "valid")

    def test_non_list_history_returns_empty(self):
        _, hist = self.sanitize("hi", "not a list")
        self.assertEqual(hist, [])

    def test_none_history_returns_empty(self):
        _, hist = self.sanitize("hi", None)
        self.assertEqual(hist, [])


# ===========================================================================
# 3. /api/chat-assistant endpoint — auth, email gate, rate limit
# ===========================================================================

def _stub_verified_uid(uid: str, email_verified: bool):
    """Patches verify_bearer_uid_and_email_verified at the local binding
    inside the already-imported route module.  The route does:

        from server.firebase_util import verify_bearer_uid_and_email_verified

    so the name lives in server.routes.chat's namespace and that is exactly
    what we must replace.
    """
    return patch(
        "server.routes.chat.verify_bearer_uid_and_email_verified",
        return_value=(uid, email_verified),
    )


class ChatEndpointAuthTest(unittest.TestCase):
    """Verifies that the endpoint enforces auth before any expensive work."""

    @classmethod
    def setUpClass(cls):
        cls.app_module = _load_app()
        cls.client = cls.app_module.app.test_client()

    def test_no_token_returns_401(self):
        r = self.client.post("/api/chat-assistant", json={"message": "hi"})
        self.assertEqual(r.status_code, 401)
        self.assertEqual(r.get_json()["error"], "unauthorized")

    def test_bad_token_returns_401(self):
        r = self.client.post(
            "/api/chat-assistant",
            json={"message": "hi"},
            headers={"Authorization": "Bearer bad-token"},
        )
        self.assertEqual(r.status_code, 401)

    def test_unverified_email_returns_403(self):
        with _stub_verified_uid("uid-unverified", email_verified=False):
            r = self.client.post(
                "/api/chat-assistant",
                json={"message": "hi"},
                headers={"Authorization": "Bearer fake"},
            )
        self.assertEqual(r.status_code, 403)
        self.assertEqual(r.get_json()["error"], "email_not_verified")

    def test_unverified_email_does_not_reach_gemini(self):
        """Gemini must never be called for an unverified account."""
        with _stub_verified_uid("uid-unverified", email_verified=False):
            with patch("server.routes.chat.generate_chat_reply") as mock_gemini:
                self.client.post(
                    "/api/chat-assistant",
                    json={"message": "hi"},
                    headers={"Authorization": "Bearer fake"},
                )
        mock_gemini.assert_not_called()


class ChatEndpointRateLimitTest(unittest.TestCase):
    """Verifies per-UID and per-IP rate limiting fires before Gemini work."""

    @classmethod
    def setUpClass(cls):
        cls.app_module = _load_app()
        cls.client = cls.app_module.app.test_client()

    def _post(self, uid="test-uid", ip="1.2.3.4"):
        with _stub_verified_uid(uid, email_verified=True):
            return self.client.post(
                "/api/chat-assistant",
                json={"message": "hi"},
                headers={
                    "Authorization": "Bearer fake",
                    "X-Forwarded-For": ip,
                },
            )

    def test_uid_rate_limit_returns_429(self):
        import server.routes.chat as chat_mod
        # Drain the UID bucket completely.
        chat_mod._uid_limiter.reset()
        # Patch bucket to always deny.
        with patch.object(chat_mod._uid_limiter, "allow", return_value=False):
            r = self._post(uid="uid-limited")
        self.assertEqual(r.status_code, 429)
        self.assertEqual(r.get_json()["error"], "rate_limited")

    def test_ip_rate_limit_returns_429(self):
        import server.routes.chat as chat_mod
        # UID limiter allows, IP limiter denies.
        with patch.object(chat_mod._uid_limiter, "allow", return_value=True), \
             patch.object(chat_mod._ip_limiter, "allow", return_value=False):
            r = self._post(ip="9.9.9.9")
        self.assertEqual(r.status_code, 429)
        self.assertEqual(r.get_json()["error"], "rate_limited")

    def test_rate_limit_does_not_reach_gemini(self):
        import server.routes.chat as chat_mod
        with patch.object(chat_mod._uid_limiter, "allow", return_value=False):
            with patch("server.routes.chat.generate_chat_reply") as mock_gemini:
                self._post(uid="uid-limited2")
        mock_gemini.assert_not_called()

    def test_missing_message_returns_400(self):
        """Sanity: a verified, non-rate-limited caller still needs a message."""
        with _stub_verified_uid("uid-ok", email_verified=True):
            r = self.client.post(
                "/api/chat-assistant",
                json={},
                headers={"Authorization": "Bearer fake"},
            )
        self.assertEqual(r.status_code, 400)


if __name__ == "__main__":
    unittest.main()
