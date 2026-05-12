"""Regression tests for daily reminder cron auth and challenge slot logic."""

from __future__ import annotations

import os
import unittest
from datetime import datetime
from unittest.mock import patch
from zoneinfo import ZoneInfo

from flask import Flask

from server.routes import reminders


class ReminderCronAuthTest(unittest.TestCase):
    def setUp(self):
        app = Flask(__name__)
        app.register_blueprint(reminders.reminder_routes)
        self.client = app.test_client()

    def test_cron_key_unset_fails_closed_before_firebase(self):
        with patch.dict(os.environ, {"CRON_KEY": ""}), \
             patch("server.routes.reminders._init_firebase_admin") as init_firebase:
            response = self.client.post("/tasks/send-daily-reminders")

        self.assertEqual(response.status_code, 500)
        self.assertEqual(response.get_json()["error"], "CRON_KEY is not configured")
        init_firebase.assert_not_called()

    def test_wrong_cron_key_is_unauthorized_before_firebase(self):
        with patch.dict(os.environ, {"CRON_KEY": "expected-secret"}), \
             patch("server.routes.reminders._init_firebase_admin") as init_firebase:
            response = self.client.post(
                "/tasks/send-daily-reminders",
                headers={"X-CRON-KEY": "wrong-secret"},
            )

        self.assertEqual(response.status_code, 401)
        self.assertEqual(response.get_json()["error"], "unauthorized")
        init_firebase.assert_not_called()


class ReminderChallengeCompletionTest(unittest.TestCase):
    def test_daily_and_weekly_challenges_use_the_current_slot(self):
        today = datetime(2026, 5, 8, 22, 0, tzinfo=ZoneInfo("America/Chicago"))
        user_doc = {
            "challenges": [
                {
                    "name": " Hydrate ",
                    "cadence": "daily",
                    "duration": 3,
                    "startDate": "2026-05-07T05:00:00Z",
                    "notes": {"1": "logged yesterday"},
                },
                {
                    "name": "Daily done",
                    "cadence": "daily",
                    "duration": 3,
                    "startDate": "2026-05-07T05:00:00Z",
                    "notes": {"2": {"content": "logged today"}},
                },
                {
                    "name": "Weekly reflection",
                    "cadence": "weekly",
                    "duration": 2,
                    "startDate": "2026-05-01T05:00:00Z",
                    "notes": {"1": "logged in week one"},
                },
                {
                    "name": "Weekly done",
                    "cadence": "weekly",
                    "duration": 2,
                    "startDate": "2026-05-01T05:00:00Z",
                    "notes": {"2": {"content": "logged in week two"}},
                },
                {
                    "name": "Expired weekly",
                    "cadence": "weekly",
                    "duration": 2,
                    "startDate": "2026-04-17T05:00:00Z",
                    "notes": {},
                },
            ]
        }

        incomplete = reminders._compute_incomplete_challenges_for_today(
            user_doc,
            today_local_date=today,
        )

        self.assertEqual(incomplete, ["Hydrate", "Weekly reflection"])

    def test_start_date_uses_user_local_calendar_day(self):
        today = datetime(2026, 5, 1, 12, 0, tzinfo=ZoneInfo("America/Los_Angeles"))
        user_doc = {
            "challenges": [
                {
                    "name": "Late UTC start",
                    "cadence": "daily",
                    "duration": 1,
                    "startDate": "2026-05-02T06:30:00Z",
                    "notes": {},
                }
            ]
        }

        incomplete = reminders._compute_incomplete_challenges_for_today(
            user_doc,
            today_local_date=today,
        )

        self.assertEqual(incomplete, ["Late UTC start"])


if __name__ == "__main__":
    unittest.main()
