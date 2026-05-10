"""Compact Firestore user snapshot for LLM prompts (supplements assistantFacts)."""

from __future__ import annotations

import json
from typing import Any, Dict, List

from server.assistant_facts import (
    get_user_timezone_and_today,
    is_challenge_past_calendar_duration,
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


def _truncate(s: str, max_len: int) -> str:
    s = s.strip()
    if len(s) <= max_len:
        return s
    return s[: max_len - 1] + "…"


def build_prompt_context_payload(user_doc: Dict[str, Any], *, note_limit: int = 400) -> Dict[str, Any]:
    name = user_doc.get("name")
    tz, today, _tz_label = get_user_timezone_and_today(user_doc)
    out: Dict[str, Any] = {
        "name": name if isinstance(name, str) else "",
        "challenges": [],
        "dailyNotesSummary": {},
    }

    challenges = user_doc.get("challenges") or []
    if not isinstance(challenges, list):
        challenges = []
    # Bound prompt size when users have many historical challenges
    challenges = challenges[:48]

    for ch in challenges:
        if not isinstance(ch, dict):
            continue
        cid = ch.get("id")
        cname = ch.get("name")
        notes_raw = ch.get("notes") or {}
        if not isinstance(notes_raw, dict):
            notes_raw = {}
        note_snippets: List[Dict[str, Any]] = []
        for day_key in sorted(notes_raw.keys(), key=lambda x: int(x) if str(x).isdigit() else 0):
            txt = _note_text(notes_raw.get(day_key)).strip()
            if txt:
                note_snippets.append(
                    {"slot": day_key, "preview": _truncate(txt, note_limit)}
                )
            if len(note_snippets) >= 12:
                break

        try:
            cd = int(ch.get("completedDays") or 0)
            dur = int(ch.get("duration") or 1)
        except Exception:
            cd, dur = 0, 1

        cadence = ch.get("cadence") if ch.get("cadence") in ("daily", "weekly") else "daily"

        calendar_window_ended = is_challenge_past_calendar_duration(ch, today, tz)

        out["challenges"].append(
            {
                "id": cid if isinstance(cid, str) else "",
                "name": cname if isinstance(cname, str) else "",
                "cadence": cadence,
                "completedDays": cd,
                "duration": max(1, dur),
                "calendarWindowEnded": calendar_window_ended,
                "challengeStatus": "archived" if calendar_window_ended else "active",
                "recentChallengeNotes": note_snippets,
            }
        )

    daily = user_doc.get("dailyNotes") or {}
    if isinstance(daily, dict):
        keys = sorted(daily.keys(), reverse=True)[:14]
        for k in keys:
            v = daily.get(k)
            if isinstance(k, str) and isinstance(v, str) and v.strip():
                out["dailyNotesSummary"][k] = _truncate(v, note_limit)

    return out


def prompt_context_json(user_doc: Dict[str, Any]) -> str:
    return json.dumps(build_prompt_context_payload(user_doc), ensure_ascii=False)
