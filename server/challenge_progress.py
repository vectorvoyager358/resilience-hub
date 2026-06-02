"""Challenge streak / slot progress (mirrors `src/utils/challengeProgress.ts` for the assistant)."""

from __future__ import annotations

from datetime import date, datetime, timedelta
from typing import Any, Dict, List, Optional

from server.assistant_facts import (
    get_challenge_cadence,
    get_challenge_calendar_day_index,
    get_challenge_calendar_start_date,
    get_total_calendar_days_in_window,
)


def _note_text(val: Any) -> str:
    if val is None:
        return ""
    if isinstance(val, str):
        return val
    if isinstance(val, dict):
        c = val.get("content")
        return c if isinstance(c, str) else ""
    return ""


def get_filled_slot_indices_descending(notes: Dict[str, Any], duration: int) -> List[int]:
    dur = max(1, duration)
    indices: List[int] = []
    for d in range(1, dur + 1):
        raw = notes.get(str(d))
        if _note_text(raw).strip():
            indices.append(d)
    indices.sort(reverse=True)
    return indices


def get_streak_timeline_position(ch: Dict[str, Any], today: date, tz) -> int:
    day_idx = get_challenge_calendar_day_index(ch, today, tz)
    if day_idx is None:
        return 0
    if get_challenge_cadence(ch) == "weekly":
        if day_idx < 1:
            return day_idx
        return (day_idx - 1) // 7 + 1
    return day_idx


def get_logged_streak_for_challenge(ch: Dict[str, Any], today: date, tz) -> int:
    notes_raw = ch.get("notes") or {}
    if not isinstance(notes_raw, dict):
        notes_raw = {}
    try:
        dur = max(1, int(ch.get("duration") or 1))
    except (TypeError, ValueError):
        dur = 1

    completed = get_filled_slot_indices_descending(notes_raw, dur)
    if not completed:
        return 0

    timeline_pos = get_streak_timeline_position(ch, today, tz)
    most_recent = completed[0]
    if timeline_pos - most_recent > 1:
        return 0

    streak = 1
    expected = most_recent - 1
    for slot in completed[1:]:
        if slot == expected:
            streak += 1
            expected -= 1
        else:
            break
    return streak


def slot_calendar_hint(ch: Dict[str, Any], slot: int, tz) -> str:
    if slot < 1:
        return ""
    start = get_challenge_calendar_start_date(ch, tz)
    if start is None:
        return ""
    if get_challenge_cadence(ch) == "weekly":
        week_start = start + timedelta(days=(slot - 1) * 7)
        week_end = week_start + timedelta(days=6)
        return f"{week_start.isoformat()}..{week_end.isoformat()}"
    d = start + timedelta(days=slot - 1)
    return d.isoformat()


def last_logged_gap(ch: Dict[str, Any], today: date, tz) -> Optional[Dict[str, Any]]:
    """
    Most recent run of empty log slot(s) inside the planned window.
    A filled note on a slot is never a "skip"; only missing slots between logs count.
    """
    notes_raw = ch.get("notes") or {}
    if not isinstance(notes_raw, dict):
        notes_raw = {}
    try:
        dur = max(1, int(ch.get("duration") or 1))
    except (TypeError, ValueError):
        dur = 1

    filled_asc = sorted(get_filled_slot_indices_descending(notes_raw, dur))
    timeline_pos = get_streak_timeline_position(ch, today, tz)
    if timeline_pos < 1:
        return None

    events: List[Dict[str, Any]] = []
    for i in range(len(filled_asc) - 1):
        a, b = filled_asc[i], filled_asc[i + 1]
        if b - a > 1:
            events.append(
                {
                    "afterLoggedSlot": a,
                    "beforeLoggedSlot": b,
                    "missedSlotStart": a + 1,
                    "missedSlotEnd": b - 1,
                }
            )

    if filled_asc and timeline_pos > filled_asc[-1] + 1:
        mr = filled_asc[-1]
        end = min(timeline_pos - 1, dur)
        if end >= mr + 1:
            events.append(
                {
                    "afterLoggedSlot": mr,
                    "beforeLoggedSlot": None,
                    "missedSlotStart": mr + 1,
                    "missedSlotEnd": end,
                }
            )

    if not events:
        return None

    gap = max(events, key=lambda e: int(e["missedSlotEnd"]))
    start_slot = int(gap["missedSlotStart"])
    end_slot = int(gap["missedSlotEnd"])
    gap["missedSlotCalendarHints"] = [
        slot_calendar_hint(ch, s, tz) for s in range(start_slot, end_slot + 1)
    ]
    gap["missedSlotCount"] = end_slot - start_slot + 1
    return gap


def challenge_logging_snapshot(
    ch: Dict[str, Any], today: date, tz
) -> Dict[str, Any]:
    """Per-challenge fields for Rich context: streak and whether a day/slot was missed recently."""
    notes_raw = ch.get("notes") or {}
    if not isinstance(notes_raw, dict):
        notes_raw = {}
    try:
        dur = max(1, int(ch.get("duration") or 1))
    except (TypeError, ValueError):
        dur = 1

    filled = get_filled_slot_indices_descending(notes_raw, dur)
    timeline_pos = get_streak_timeline_position(ch, today, tz)
    streak = get_logged_streak_for_challenge(ch, today, tz)
    most_recent_slot = filled[0] if filled else None
    gap_before_today = (
        most_recent_slot is not None and timeline_pos - most_recent_slot > 1
    )

    snap: Dict[str, Any] = {
        "loggedStreak": streak,
        "currentTimelineSlot": timeline_pos,
        "mostRecentLoggedSlot": most_recent_slot,
        "streakActive": streak > 0,
        "missedLogSinceLastEntry": gap_before_today,
        "totalLoggedSlots": len(filled),
    }
    gap_info = last_logged_gap(ch, today, tz)
    if gap_info is not None:
        snap["lastLoggedGap"] = gap_info
    return snap
