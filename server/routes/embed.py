"""Authenticated embedding proxy.

Replaces the in-browser Gemini call so the API key never ships to the client.
Returns a 768-dim vector to match the Pinecone index dimension.
"""

from __future__ import annotations

import logging
import os
from typing import Any, Dict, Tuple

from flask import Blueprint, jsonify, request

from server.auth_util import require_uid
from server.gemini_client import embed_query_text
from server.rate_limit import create_rate_limiter

logger = logging.getLogger(__name__)

embed_routes = Blueprint("embed", __name__)

MAX_EMBED_INPUT_CHARS = 4000

# Per-uid: ~60 embeds + 5 sustained req/s. Tune via env if you raise the cap.
_RATE_CAPACITY = int(os.environ.get("EMBED_RATE_CAPACITY", "60"))
_RATE_REFILL = float(os.environ.get("EMBED_RATE_REFILL_PER_SEC", "5"))
_limiter = create_rate_limiter(
    scope="embed-uid", capacity=_RATE_CAPACITY, refill_per_second=_RATE_REFILL
)


def _check_rate(uid: str) -> Tuple[Dict[str, Any], int] | None:
    if not _limiter.allow(uid):
        return {"error": "rate_limited"}, 429
    return None


@embed_routes.route("/api/embed", methods=["POST"])
def embed_text():
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
    raw_text = payload.get("text")
    if not isinstance(raw_text, str):
        return jsonify({"error": "text required"}), 400
    text = raw_text.strip()
    if not text:
        return jsonify({"error": "text required"}), 400
    if len(text) > MAX_EMBED_INPUT_CHARS:
        text = text[:MAX_EMBED_INPUT_CHARS]

    try:
        vector = embed_query_text(text)
    except RuntimeError as e:
        logger.warning("embed failed uid=%s err=%s", uid, e)
        return jsonify({"error": "embedding_failed"}), 503
    except Exception:
        logger.exception("embed unexpected failure uid=%s", uid)
        return jsonify({"error": "internal_error"}), 500

    return jsonify({"vector": vector})
