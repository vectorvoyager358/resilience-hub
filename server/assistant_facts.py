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


def build_assistant_facts(user_doc: Dict[str, Any]) -> Dict[str, Any]:
    """
    Structured counts for prompts — models must use this for aggregates, not RAG snippets.
    """
    tz_name = user_doc.get("timezone")
    if not isinstance(tz_name, str) or not tz_name.strip():
        tz_name = "UTC"
    try:
        tz = ZoneInfo(tz_name.strip())
    except Exception:
        tz = ZoneInfo("UTC")
        tz_name = "UTC"

    now_local = datetime.now(tz)
    today: date = now_local.date()
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
