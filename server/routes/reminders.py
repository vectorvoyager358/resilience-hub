from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta, time
from zoneinfo import ZoneInfo
import os
import re
from typing import Any, Dict, List, Optional, Tuple

from flask import Blueprint, jsonify, request

import firebase_admin
from firebase_admin import messaging
from google.cloud import firestore


reminder_routes = Blueprint("reminders", __name__)


def _get_cron_key() -> str:
    return os.environ.get("CRON_KEY", "").strip()


def _require_cron_auth() -> Optional[Tuple[Dict[str, Any], int]]:
    expected = _get_cron_key()
    if not expected:
        # If unset, default to deny; it's too easy to expose a public endpoint accidentally.
        return {"error": "CRON_KEY is not configured"}, 500
    provided = request.headers.get("X-CRON-KEY", "").strip()
    if provided != expected:
        return {"error": "unauthorized"}, 401
    return None


def _init_firebase_admin() -> None:
    if firebase_admin._apps:
        return
    project_id = (os.environ.get("GOOGLE_CLOUD_PROJECT") or "").strip()
    if project_id:
        firebase_admin.initialize_app(options={"projectId": project_id})
    else:
        firebase_admin.initialize_app()


_ISO_Z_RE = re.compile(r"Z$")


def _parse_iso_datetime(s: str) -> datetime:
    # Firestore stores challenge.startDate like: "2026-05-01T02:25:16.254Z"
    s = s.strip()
    if _ISO_Z_RE.search(s):
        s = _ISO_Z_RE.sub("+00:00", s)
    dt = datetime.fromisoformat(s)
    if dt.tzinfo is None:
        # Treat as UTC if tz is missing (defensive).
        dt = dt.replace(tzinfo=ZoneInfo("UTC"))
    return dt


def _minutes_until_next_midnight(now_local: datetime) -> int:
    tz = now_local.tzinfo
    assert tz is not None
    next_day = now_local.date() + timedelta(days=1)
    next_midnight = datetime.combine(next_day, time(0, 0), tzinfo=tz)
    delta = next_midnight - now_local
    return int(delta.total_seconds() // 60)


def _note_content(note_value: Any) -> str:
    if note_value is None:
        return ""
    if isinstance(note_value, str):
        return note_value
    if isinstance(note_value, dict):
        c = note_value.get("content")
        return c if isinstance(c, str) else ""
    return ""


@dataclass
class ReminderResult:
    uid: str
    sent: bool
    reason: str
    incomplete: List[str]


def _compute_incomplete_challenges_for_today(
    user_doc: Dict[str, Any], *, today_local_date
) -> List[str]:
    challenges = user_doc.get("challenges") or []
    incomplete: List[str] = []

    for ch in challenges:
        if not isinstance(ch, dict):
            continue
        name = ch.get("name")
        if not isinstance(name, str) or not name.strip():
            continue

        cadence = ch.get("cadence")
        if cadence not in ("daily", "weekly", None):
            cadence = None
        cadence = cadence or "daily"

        duration = ch.get("duration")
        try:
            duration_int = int(duration)
        except Exception:
            continue
        if duration_int < 1:
            continue

        start_date_raw = ch.get("startDate")
        if not isinstance(start_date_raw, str) or not start_date_raw.strip():
            continue

        # Convert startDate into user's local calendar date (same intent as frontend logic).
        start_dt_utc = _parse_iso_datetime(start_date_raw)
        tz: ZoneInfo = today_local_date.tzinfo  # type: ignore[attr-defined]
        start_local_date = start_dt_utc.astimezone(tz).date()

        days_since_start = (today_local_date.date() - start_local_date).days
        if cadence == "weekly":
            # Weekly challenges: duration is number of week-slots since startDate.
            # Week 1 is days 0..6 since start; week 2 is 7..13, etc.
            slot_index = (days_since_start // 7) + 1
        else:
            # Daily challenges: slot index is calendar days since start + 1.
            slot_index = days_since_start + 1

        if slot_index < 1 or slot_index > duration_int:
            continue  # not active in current slot

        notes = ch.get("notes") or {}
        if not isinstance(notes, dict):
            notes = {}
        note_value = notes.get(str(slot_index))
        content = _note_content(note_value).strip()
        if content:
            continue  # done

        incomplete.append(name.strip())

    return incomplete


@reminder_routes.route("/tasks/send-daily-reminders", methods=["POST"])
def send_daily_reminders():
    auth_err = _require_cron_auth()
    if auth_err is not None:
        payload, code = auth_err
        return jsonify(payload), code

    _init_firebase_admin()
    db = firestore.Client()

    window_minutes = int(os.environ.get("REMINDER_WINDOW_MINUTES", "10"))
    half_window = max(1, window_minutes // 2)

    results: List[ReminderResult] = []
    sent_count = 0

    for snap in db.collection("users").stream():
        uid = snap.id
        user_doc = snap.to_dict() or {}

        if user_doc.get("pushRemindersEnabled") is False:
            results.append(ReminderResult(uid=uid, sent=False, reason="disabled", incomplete=[]))
            continue

        tz_name = user_doc.get("timezone")
        if not isinstance(tz_name, str) or not tz_name.strip():
            results.append(ReminderResult(uid=uid, sent=False, reason="missing_timezone", incomplete=[]))
            continue

        try:
            tz = ZoneInfo(tz_name)
        except Exception:
            results.append(ReminderResult(uid=uid, sent=False, reason="invalid_timezone", incomplete=[]))
            continue

        now_local = datetime.now(tz)
        mins_to_midnight = _minutes_until_next_midnight(now_local)

        # Target: 2 hours before local midnight.
        if abs(mins_to_midnight - 120) > half_window:
            results.append(ReminderResult(uid=uid, sent=False, reason="outside_window", incomplete=[]))
            continue

        today_local_str = now_local.date().isoformat()
        if user_doc.get("lastReminderSentLocalDate") == today_local_str:
            results.append(ReminderResult(uid=uid, sent=False, reason="already_sent", incomplete=[]))
            continue

        tokens = user_doc.get("fcmTokens") or []
        if not isinstance(tokens, list):
            tokens = []
        tokens = [t for t in tokens if isinstance(t, str) and t.strip()]
        if not tokens:
            results.append(ReminderResult(uid=uid, sent=False, reason="missing_tokens", incomplete=[]))
            continue

        # Reuse the same local-day semantics as the frontend: calendar-day index from startDate.
        incomplete = _compute_incomplete_challenges_for_today(user_doc, today_local_date=now_local)
        if not incomplete:
            results.append(ReminderResult(uid=uid, sent=False, reason="nothing_to_remind", incomplete=[]))
            continue

        title = "Resilience Hub"
        shown = incomplete[:3]
        remaining = max(0, len(incomplete) - len(shown))
        more = f" (+{remaining} more)" if remaining else ""
        body = "Keep your streak alive. Log: " + ", ".join(shown) + more + "."

        # Data-only message to avoid duplicate notifications on some clients.
        # The service worker (web/PWA) will display the notification.
        message = messaging.MulticastMessage(
            data={"url": "/dashboard?pending=1", "title": title, "body": body},
            tokens=tokens,
        )

        response = messaging.send_each_for_multicast(message)

        # Prune invalid tokens.
        invalid_tokens: List[str] = []
        for idx, r in enumerate(response.responses):
            if r.success:
                continue
            t = tokens[idx]
            err = r.exception
            if err is None:
                continue
            code = getattr(err, "code", "") or ""
            if code in ("messaging/registration-token-not-registered", "messaging/invalid-argument"):
                invalid_tokens.append(t)

        user_ref = db.collection("users").document(uid)
        updates: Dict[str, Any] = {"lastReminderSentLocalDate": today_local_str, "updatedAt": datetime.utcnow().isoformat()}
        if invalid_tokens:
            updates["fcmTokens"] = firestore.ArrayRemove(invalid_tokens)
        user_ref.set(updates, merge=True)

        sent_count += 1
        results.append(ReminderResult(uid=uid, sent=True, reason="sent", incomplete=incomplete))

    return jsonify(
        {
            "status": "ok",
            "sent": sent_count,
            "checked": len(results),
            "results": [
                {
                    "uid": r.uid,
                    "sent": r.sent,
                    "reason": r.reason,
                    "incomplete": r.incomplete,
                }
                for r in results
            ],
        }
    )

