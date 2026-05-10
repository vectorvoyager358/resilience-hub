"""Authenticated FCM token registration.

Avoids letting clients write arbitrary tokens directly into Firestore (which
the reminders cron then pushes to). The server validates the token by sending
a `dry_run` FCM message and only persists it on acceptance.
"""

from __future__ import annotations

import logging
import os
import re
from datetime import datetime, timezone
from typing import Any, Dict, Tuple

from flask import Blueprint, jsonify, request
from firebase_admin import messaging
from google.cloud import firestore

from server.auth_util import require_uid
from server.firebase_util import init_firebase_admin
from server.rate_limit import TokenBucketLimiter

logger = logging.getLogger(__name__)

push_routes = Blueprint("push", __name__)

_RATE_CAPACITY = int(os.environ.get("PUSH_RATE_CAPACITY", "10"))
_RATE_REFILL = float(os.environ.get("PUSH_RATE_REFILL_PER_SEC", "0.2"))
_limiter = TokenBucketLimiter(capacity=_RATE_CAPACITY, refill_per_second=_RATE_REFILL)

# FCM tokens are typically 140-300 base64-ish chars. Be generous but bounded.
_TOKEN_RE = re.compile(r"^[A-Za-z0-9_:\-]{20,4096}$")
_TIMEZONE_RE = re.compile(r"^[A-Za-z][A-Za-z0-9_+\-/]{0,63}$")


def _check_rate(uid: str) -> Tuple[Dict[str, Any], int] | None:
    if not _limiter.allow(uid):
        return {"error": "rate_limited"}, 429
    return None


def _validate_token(token: Any) -> Tuple[bool, str | None]:
    if not isinstance(token, str):
        return False, "token must be a string"
    if not _TOKEN_RE.match(token):
        return False, "token format invalid"
    return True, None


def _validate_timezone(tz: Any) -> Tuple[bool, str | None]:
    if tz is None:
        return True, None
    if not isinstance(tz, str) or not _TIMEZONE_RE.match(tz):
        return False, "timezone format invalid"
    try:
        from zoneinfo import ZoneInfo

        ZoneInfo(tz)
    except Exception:
        return False, "timezone not recognized"
    return True, None


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


@push_routes.route("/api/push/register", methods=["POST"])
def register_push_token():
    uid, err = require_uid()
    if err is not None:
        body, code = err
        return body, code
    assert uid is not None

    rate_err = _check_rate(uid)
    if rate_err is not None:
        body, code = rate_err
        return jsonify(body), code

    payload = request.get_json(silent=True) or {}

    ok, terr = _validate_token(payload.get("token"))
    if not ok:
        return jsonify({"error": terr}), 400
    token: str = payload["token"]

    raw_tz = payload.get("timezone")
    ok, tzerr = _validate_timezone(raw_tz)
    if not ok:
        return jsonify({"error": tzerr}), 400

    init_firebase_admin()

    # Prove the token is real and addressable to OUR FCM project before storing it.
    try:
        messaging.send(messaging.Message(token=token, data={"probe": "1"}), dry_run=True)
    except messaging.UnregisteredError:
        return jsonify({"error": "token_unregistered"}), 400
    except ValueError:
        return jsonify({"error": "token_invalid"}), 400
    except Exception:
        logger.exception("fcm dry-run failed uid=%s", uid)
        return jsonify({"error": "fcm_unavailable"}), 503

    db = firestore.Client()
    user_ref = db.collection("users").document(uid)
    updates: Dict[str, Any] = {
        "fcmTokens": firestore.ArrayUnion([token]),
        "fcmTokenUpdatedAt": _utc_now_iso(),
        "updatedAt": _utc_now_iso(),
    }
    if isinstance(raw_tz, str):
        updates["timezone"] = raw_tz
        updates["timezoneUpdatedAt"] = _utc_now_iso()

    user_ref.set(updates, merge=True)
    logger.info("fcm token registered uid=%s", uid)
    return jsonify({"status": "ok"})


@push_routes.route("/api/push/unregister", methods=["POST"])
def unregister_push_token():
    uid, err = require_uid()
    if err is not None:
        body, code = err
        return body, code
    assert uid is not None

    rate_err = _check_rate(uid)
    if rate_err is not None:
        body, code = rate_err
        return jsonify(body), code

    payload = request.get_json(silent=True) or {}
    ok, terr = _validate_token(payload.get("token"))
    if not ok:
        return jsonify({"error": terr}), 400
    token: str = payload["token"]

    init_firebase_admin()
    db = firestore.Client()
    user_ref = db.collection("users").document(uid)
    user_ref.set(
        {
            "fcmTokens": firestore.ArrayRemove([token]),
            "updatedAt": _utc_now_iso(),
        },
        merge=True,
    )
    logger.info("fcm token unregistered uid=%s", uid)
    return jsonify({"status": "ok"})
