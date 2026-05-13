"""Current conditions via Open-Meteo (coordinates from the client)."""

from __future__ import annotations

import json
import logging
import re
import urllib.error
from datetime import datetime
from zoneinfo import ZoneInfo
import urllib.parse
import urllib.request
from typing import Any, Dict, Optional, Tuple

from flask import Blueprint, jsonify, request

from server.auth_util import require_uid

logger = logging.getLogger(__name__)

weather_routes = Blueprint("weather", __name__)

_OPEN_METEO_FORECAST = "https://api.open-meteo.com/v1/forecast"


def _http_get_json(url: str, *, headers: Optional[Dict[str, str]] = None, timeout: float = 12.0) -> Dict[str, Any]:
    req = urllib.request.Request(url, headers=dict(headers or {}), method="GET")
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        raw = resp.read()
    return json.loads(raw.decode("utf-8"))


def _parse_lat_lon() -> Tuple[Optional[float], Optional[float], Optional[Tuple[Any, int]]]:
    try:
        lat = float(request.args.get("lat", "").strip())
        lon = float(request.args.get("lon", "").strip())
    except (TypeError, ValueError):
        return None, None, (jsonify({"error": "invalid lat or lon"}), 400)
    if not (-90.0 <= lat <= 90.0 and -180.0 <= lon <= 180.0):
        return None, None, (jsonify({"error": "lat or lon out of range"}), 400)
    return lat, lon, None


def _format_observation_local(obs_time: Optional[str], tz_name: Optional[str]) -> Optional[str]:
    """Open-Meteo `current.time` is wall time in the forecast timezone when timezone=auto."""
    if not obs_time or not tz_name:
        return None
    try:
        dt = datetime.fromisoformat(obs_time.replace("Z", ""))
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=ZoneInfo(tz_name))
        return dt.strftime("%H:%M")
    except (ValueError, OSError, TypeError):
        return None


def _infer_is_day_from_clock(obs_local: Optional[str]) -> Optional[bool]:
    """Rough day/night from `HH:MM` when Open-Meteo omits `is_day` (matches client heuristic)."""
    if not obs_local or not isinstance(obs_local, str):
        return None
    m = re.match(r"^(\d{1,2}):(\d{2})", obs_local.strip())
    if not m:
        return None
    h = int(m.group(1))
    if h < 0 or h > 23:
        return None
    return 6 <= h < 19


def _coerce_is_day(is_day_raw: Any, obs_local: Optional[str]) -> bool:
    """Normalize Open-Meteo `is_day` (bool / 0 / 1); infer from clock when missing."""
    if is_day_raw is False or is_day_raw == 0 or is_day_raw == "0":
        return False
    if is_day_raw is True or is_day_raw == 1 or is_day_raw == "1":
        return True
    inferred = _infer_is_day_from_clock(obs_local)
    if inferred is not None:
        return inferred
    return True


def _weather_display_emojis(is_day: bool, weather_code: int) -> str:
    """WMO `weather_code` + day/night (Open-Meteo `is_day`). Mirrors dashboard rules."""
    period = "\U0001f31e" if is_day else "\U0001f319"  # 🌞 / 🌙
    code = weather_code

    if code in (45, 48):
        return f"{period}\U0001f32b\ufe0f"  # 🌫️
    if code in (51, 53, 55, 56, 57):
        return f"{period}\U0001f326\ufe0f"  # 🌦️
    if code in (61, 63, 65, 66, 67, 80, 81, 82):
        return f"{period}\U0001f327\ufe0f"  # 🌧️
    if code in (71, 73, 75, 77, 85, 86):
        return f"{period}\u2744\ufe0f"  # ❄️
    if code in (95, 96, 99):
        return f"{period}\u26c8\ufe0f"  # ⛈️

    if code == 0:
        return "\U0001f31e" if is_day else "\U0001f319\u2728"  # 🌞 / 🌙✨
    if code == 1:
        return f"{period}\U0001f324\ufe0f"  # 🌤️
    if code == 2:
        return f"{period}\u26c5"  # ⛅
    if code == 3:
        return f"{period}\u2601\ufe0f"  # ☁️
    return f"{period}\U0001f321\ufe0f"  # 🌡️


@weather_routes.route("/api/weather", methods=["GET"])
def current_weather():
    uid, auth_err = require_uid()
    if auth_err is not None:
        return auth_err
    _ = uid  # authenticated; no per-uid store needed for this read-only proxy

    lat, lon, err = _parse_lat_lon()
    if err is not None:
        return err

    # Do not pass `time` inside `current=` — Open-Meteo rejects it (400) and still
    # returns `current.time` whenever other current variables are requested.
    params = urllib.parse.urlencode(
        {
            "latitude": lat,
            "longitude": lon,
            "timezone": "auto",
            "current": "temperature_2m,weather_code,is_day",
        }
    )
    om_url = f"{_OPEN_METEO_FORECAST}?{params}"
    try:
        om = _http_get_json(om_url, timeout=12.0)
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError, ValueError) as e:
        logger.warning("open-meteo forecast failed: %s", e)
        return jsonify({"error": "weather_unavailable"}), 502

    current = om.get("current")
    if not isinstance(current, dict):
        return jsonify({"error": "weather_unavailable"}), 502

    temp = current.get("temperature_2m")
    wcode_raw = current.get("weather_code")
    obs_time = current.get("time")
    if not isinstance(temp, (int, float)):
        return jsonify({"error": "weather_unavailable"}), 502
    try:
        wcode = int(wcode_raw)
    except (TypeError, ValueError):
        return jsonify({"error": "weather_unavailable"}), 502

    tz_name = om.get("timezone")
    if not isinstance(tz_name, str):
        tz_name = None

    obs_str = obs_time if isinstance(obs_time, str) else None
    obs_local = _format_observation_local(obs_str, tz_name)
    is_day = _coerce_is_day(current.get("is_day"), obs_local)
    emojis = _weather_display_emojis(is_day, wcode)

    return jsonify(
        {
            "temperatureC": round(float(temp), 1),
            "weatherCode": wcode,
            "isDay": is_day,
            "observationTimeLocal": obs_local,
            "emojis": emojis,
        }
    )
