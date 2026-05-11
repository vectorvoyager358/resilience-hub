"""Shared Firebase Admin initialization for Flask routes."""

from __future__ import annotations

import os

import firebase_admin
from firebase_admin import auth as firebase_auth


def _firebase_project_id() -> str | None:
    """Must match VITE_FIREBASE_PROJECT_ID / the project users sign in on."""
    for key in ("FIREBASE_PROJECT_ID", "GOOGLE_CLOUD_PROJECT", "GCLOUD_PROJECT"):
        v = (os.environ.get(key) or "").strip()
        if v:
            return v
    return None


def init_firebase_admin() -> None:
    if firebase_admin._apps:
        return
    project_id = _firebase_project_id()
    if project_id:
        firebase_admin.initialize_app(options={"projectId": project_id})
    else:
        firebase_admin.initialize_app()


def verify_bearer_uid(authorization_header: str | None) -> str:
    """
    Returns Firebase uid from `Authorization: Bearer <idToken>`.
    Raises ValueError on missing/invalid token.
    """
    if not authorization_header or not authorization_header.startswith("Bearer "):
        raise ValueError("missing_bearer")
    token = authorization_header[7:].strip()
    if not token:
        raise ValueError("empty_token")
    init_firebase_admin()
    decoded = firebase_auth.verify_id_token(token)
    uid = decoded.get("uid")
    if not isinstance(uid, str) or not uid:
        raise ValueError("no_uid")
    return uid


def verify_bearer_uid_and_email_verified(authorization_header: str | None) -> tuple[str, bool]:
    """
    Returns (uid, email_verified) from `Authorization: Bearer <idToken>`.
    Raises ValueError on missing/invalid token.
    """
    if not authorization_header or not authorization_header.startswith("Bearer "):
        raise ValueError("missing_bearer")
    token = authorization_header[7:].strip()
    if not token:
        raise ValueError("empty_token")

    init_firebase_admin()
    decoded = firebase_auth.verify_id_token(token)
    uid = decoded.get("uid")
    if not isinstance(uid, str) or not uid:
        raise ValueError("no_uid")

    # Enforce account activation state server-side, independent of any
    # frontend-only gates or potentially stale ID token claims.
    user = firebase_auth.get_user(uid)
    email_verified = getattr(user, "email_verified", False)
    return uid, bool(email_verified)
