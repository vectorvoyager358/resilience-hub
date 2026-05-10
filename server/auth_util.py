"""Shared Flask helpers for Firebase-authenticated routes."""

from __future__ import annotations

from typing import Optional, Tuple

from flask import jsonify, request

from server.firebase_util import verify_bearer_uid


def require_uid() -> Tuple[Optional[str], Optional[Tuple[object, int]]]:
    """Returns (uid, None) on success, or (None, (json_body, status_code)) on failure."""
    auth_header = request.headers.get("Authorization")
    try:
        uid = verify_bearer_uid(auth_header)
    except ValueError:
        return None, (jsonify({"error": "unauthorized"}), 401)
    except Exception:
        return None, (jsonify({"error": "unauthorized"}), 401)
    return uid, None
