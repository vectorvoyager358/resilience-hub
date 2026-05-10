"""
Authoritative challenge/reflection stats for the chat assistant (mirrors Dashboard
active vs archived and cadence using the same calendar rules as `challengeProgress.ts`).
"""

from __future__ import annotations

import re
from datetime import date, datetime, time
from typing import Any, Dict, List, Optional
from zoneinfo import ZoneInfo

_ISO_Z_RE = re.compile(r"Z$")


def parse_iso_datetime(s: str) -> datetime:
    s = s.strip()
    if _ISO_Z_RE.search(s):
        s = _ISO_Z_RE.sub("+00:00", s)
    dt = datetime.fromisoformat(s)
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=ZoneInfo("UTC"))
    return dt


def get_challenge_cadence(ch: Dict[str, Any]) -> str:
    return "weekly" if ch.get("cadence") == "weekly" else "daily"


def get_challenge_calendar_start_date(ch: Dict[str, Any], tz: ZoneInfo) -> Optional[date]:
    raw = ch.get("startDate")
    if not isinstance(raw, str) or not raw.strip():
        return None
    try:
        dt = parse_iso_datetime(raw)
        loc = dt.astimezone(tz)
        return loc.date()
    except Exception:
        return None


def get_challenge_calendar_day_index(ch: Dict[str, Any], today: date, tz: ZoneInfo) -> Optional[int]:
    start = get_challenge_calendar_start_date(ch, tz)
    if start is None:
        return None
    days = (today - start).days
    return days + 1


def get_total_calendar_days_in_window(ch: Dict[str, Any]) -> int:
    try:
        dur = int(ch.get("duration") or 1)
    except Exception:
        dur = 1
    dur = max(1, dur)
    if get_challenge_cadence(ch) == "weekly":
        return dur * 7
    return dur


def is_challenge_past_calendar_duration(ch: Dict[str, Any], today: date, tz: ZoneInfo) -> bool:
    idx = get_challenge_calendar_day_index(ch, today, tz)
    if idx is None:
        return False
    return idx > get_total_calendar_days_in_window(ch)


def _count_by_cadence(challenges: List[Dict[str, Any]]) -> Dict[str, int]:
    out = {"daily": 0, "weekly": 0}
    for ch in challenges:
        c = get_challenge_cadence(ch)
        out[c] = out.get(c, 0) + 1
    return out


def _challenge_plan_summary(ch: Dict[str, Any]) -> Dict[str, Any]:
    """Planned duration semantics match the app: daily = days; weekly = week-slots (each slot = 7 calendar days)."""
    raw_name = ch.get("name")
    name = raw_name.strip() if isinstance(raw_name, str) else ""
    if not name:
        name = "(unnamed)"
    cadence = get_challenge_cadence(ch)
    try:
        slots = max(1, int(ch.get("duration") or 1))
    except Exception:
        slots = 1
    if cadence == "weekly":
        calendar_days = slots * 7
        human = f"{slots} week-long slots ({calendar_days} calendar days in the planned window)"
    else:
        calendar_days = slots
        human = f"{slots} days (daily)"

    return {
        "name": name,
        "cadence": cadence,
        "plannedSlots": slots,
        "plannedSlotUnit": "weeks" if cadence == "weekly" else "days",
        "totalCalendarDaysInPlannedWindow": calendar_days,
        "durationSummary": human,
    }


def get_user_timezone_and_today(user_doc: Dict[str, Any]) -> tuple[ZoneInfo, date, str]:
    """User's ZoneInfo, today's local date, and timezone label (for prompts)."""
    tz_name = user_doc.get("timezone")
    if not isinstance(tz_name, str) or not tz_name.strip():
        tz_name = "UTC"
    try:
        tz = ZoneInfo(tz_name.strip())
    except Exception:
        tz = ZoneInfo("UTC")
        tz_name = "UTC"

    now_local = datetime.now(tz)
    today = now_local.date()
    return tz, today, tz_name


def build_assistant_facts(user_doc: Dict[str, Any]) -> Dict[str, Any]:
    """
    Structured counts for prompts — models must use this for aggregates, not RAG snippets.
    """
    tz, today, tz_name = get_user_timezone_and_today(user_doc)
    today_key = today.isoformat()

    raw_challenges = user_doc.get("challenges") or []
    challenges: List[Dict[str, Any]] = [c for c in raw_challenges if isinstance(c, dict)]

    active: List[Dict[str, Any]] = []
    archived: List[Dict[str, Any]] = []
    for ch in challenges:
        if is_challenge_past_calendar_duration(ch, today, tz):
            archived.append(ch)
        else:
            active.append(ch)

    daily_notes = user_doc.get("dailyNotes") or {}
    if not isinstance(daily_notes, dict):
        daily_notes = {}

    reflection_days = [k for k in daily_notes.keys() if isinstance(k, str)]
    has_today = bool(daily_notes.get(today_key))

    now_local = datetime.now(tz)
    return {
        "timezone": tz_name,
        "todayLocal": today_key,
        "generatedAt": now_local.isoformat(),
        "challenges": {
            "total": len(challenges),
            "activeCount": len(active),
            "archivedCount": len(archived),
            "activeByCadence": _count_by_cadence(active),
            "archivedByCadence": _count_by_cadence(archived),
            # Authoritative per-challenge rows — use these for named lists; do not invent from Rich context.
            "challengeLists": {
                "active": [_challenge_plan_summary(c) for c in active],
                "archived": [_challenge_plan_summary(c) for c in archived],
            },
        },
        "dailyReflections": {
            "daysWithNote": len(reflection_days),
            "hasNoteToday": has_today,
        },
        "definitions": {
            "activeChallenge": "Challenge calendar window has not ended (today is on or before the last planned day).",
            "archivedChallenge": "Challenge calendar window has ended (today is after the last planned day).",
            "dailyCadence": "Each planned unit is one calendar day from startDate.",
            "weeklyCadence": "Each planned unit is one week-long slot (7 calendar days per slot).",
        },
    }
