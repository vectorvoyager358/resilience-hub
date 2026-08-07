"""Authenticated Pinecone vector mutation routes.

Both endpoints require a valid Firebase ID token; the verified `uid` is the
sole source of truth for ownership. Body fields like `userId` are ignored, and
all `vectorId` / `prefix` operations must target the caller's own namespace.
"""

from __future__ import annotations

import logging
import os
import time
from typing import Any, Dict, Tuple

from flask import Blueprint, jsonify, request

from server.auth_util import require_uid
from server.index_content import (
    chunk_vector_id_prefix,
    delete_vectors_by_id_prefix,
    index_content_chunks,
    parent_id_for,
)
from server.rate_limit import create_rate_limiter

logger = logging.getLogger(__name__)

pinecone_routes = Blueprint("pinecone", __name__)

# Lazy-init so module import is side-effect free (helps tests + cold-start).
_index_singleton: Any = None


def _get_index() -> Any:
    global _index_singleton
    if _index_singleton is None:
        from pinecone import Pinecone

        _index_singleton = Pinecone(api_key=os.getenv("PINECONE_API_KEY")).Index(
            os.getenv("PINECONE_INDEX_NAME")
        )
    return _index_singleton

# Per-uid token bucket: ~30 mutations + 5 sustained req/s. Tune via env.
_RATE_CAPACITY = int(os.environ.get("PINECONE_RATE_CAPACITY", "30"))
_RATE_REFILL = float(os.environ.get("PINECONE_RATE_REFILL_PER_SEC", "5"))
_limiter = create_rate_limiter(
    scope="pinecone-uid", capacity=_RATE_CAPACITY, refill_per_second=_RATE_REFILL
)

# Pinecone allows up to 1000 ids per delete; deletes-by-prefix iterate.
_DELETE_BATCH_SIZE = 100
_MAX_PREFIX_FETCH = 10000
_EMBED_DIM = 768


def _vector_id_for(uid: str, metadata: Dict[str, Any]) -> str:
    timestamp = int(time.time() * 1000)
    type_str = metadata.get("type") if isinstance(metadata.get("type"), str) else "unknown"
    challenge_id = metadata.get("challengeId") if isinstance(metadata.get("challengeId"), str) else ""
    return f"{uid}-{type_str}-{challenge_id}-{timestamp}"


def _coerce_vector(raw: Any) -> Tuple[bool, list[float] | str]:
    if not isinstance(raw, list) or not raw:
        return False, "vector must be a non-empty list of numbers"
    if len(raw) != _EMBED_DIM:
        return False, f"vector must have {_EMBED_DIM} dimensions"
    out: list[float] = []
    for x in raw:
        if isinstance(x, bool) or not isinstance(x, (int, float)):
            return False, "vector must contain only numbers"
        out.append(float(x))
    return True, out


def _sanitize_metadata(raw: Any, uid: str) -> Tuple[bool, Dict[str, Any] | str]:
    if not isinstance(raw, dict):
        return False, "metadata must be an object"
    allowed = {
        "type",
        "challengeId",
        "challengeName",
        "dayNumber",
        "content",
        "date",
        "dateCreated",
        "completionDate",
        "parent_id",
        "chunk_index",
        "chunk_count",
    }
    cleaned: Dict[str, Any] = {}
    for key, value in raw.items():
        if key not in allowed:
            continue
        if isinstance(value, (str, int, float, bool)):
            if isinstance(value, str) and len(value) > 8000:
                value = value[:8000]
            cleaned[key] = value
    cleaned["user_id"] = uid
    return True, cleaned


def _check_rate(uid: str) -> Tuple[Dict[str, Any], int] | None:
    if not _limiter.allow(uid):
        return {"error": "rate_limited"}, 429
    return None


@pinecone_routes.route("/api/upsert-pinecone", methods=["POST"])
def upsert_to_pinecone():
    uid, err = require_uid()
    if err is not None:
        body, code = err
        return body, code
    assert uid is not None

    rate_err = _check_rate(uid)
    if rate_err is not None:
        body, code = rate_err
        return jsonify(body), code

    try:
        data = request.get_json(silent=True) or {}

        ok, md_or_err = _sanitize_metadata(data.get("metadata"), uid)
        if not ok:
            return jsonify({"error": md_or_err}), 400
        metadata = md_or_err

        raw_content = data.get("content")
        content = raw_content.strip() if isinstance(raw_content, str) else ""
        raw_vector = data.get("vector")

        # Preferred path (#76): server chunks + embeds from full content.
        if content:
            try:
                vector_id, chunk_count = index_content_chunks(
                    _get_index(),
                    uid=uid,
                    content=content,
                    metadata=metadata,
                )
            except ValueError as e:
                code = str(e)
                if code == "content_empty":
                    return jsonify({"error": "content required"}), 400
                if code == "metadata_missing_parent_key":
                    return jsonify({"error": "metadata_missing_parent_key"}), 400
                raise
            except RuntimeError as e:
                if str(e) == "embedding_failed":
                    logger.warning("index_content embed failed uid=%s", uid)
                    return jsonify({"error": "embedding_failed"}), 503
                raise
            parent = parent_id_for(uid, metadata)
            return jsonify(
                {
                    "status": "success",
                    "vectorId": vector_id,
                    "parentId": parent,
                    "chunkCount": chunk_count,
                    "message": "Content indexed",
                }
            )

        ok, vec_or_err = _coerce_vector(raw_vector)
        if not ok:
            return jsonify({"error": vec_or_err}), 400
        vector = vec_or_err

        vector_id = _vector_id_for(uid, metadata)
        _get_index().upsert(vectors=[(vector_id, vector, metadata)])
        logger.info("pinecone upsert ok uid=%s vid=%s", uid, vector_id)

        return jsonify(
            {
                "status": "success",
                "vectorId": vector_id,
                "chunkCount": 1,
                "message": "Vector successfully upserted",
            }
        )
    except RuntimeError as e:
        if str(e) == "embedding_failed":
            return jsonify({"error": "embedding_failed"}), 503
        logger.exception("pinecone upsert failed uid=%s", uid)
        return jsonify({"error": "internal_error"}), 500
    except Exception:
        logger.exception("pinecone upsert failed uid=%s", uid)
        return jsonify({"error": "internal_error"}), 500


@pinecone_routes.route("/api/delete-pinecone", methods=["POST"])
def delete_from_pinecone():
    uid, err = require_uid()
    if err is not None:
        body, code = err
        return body, code
    assert uid is not None

    rate_err = _check_rate(uid)
    if rate_err is not None:
        body, code = rate_err
        return jsonify(body), code

    try:
        data = request.get_json(silent=True) or {}
        raw_vector_id = data.get("vectorId")
        raw_prefix = data.get("prefix")
        raw_parent_id = data.get("parentId")

        vector_id = raw_vector_id if isinstance(raw_vector_id, str) and raw_vector_id.strip() else None
        prefix = raw_prefix if isinstance(raw_prefix, str) and raw_prefix.strip() else None
        parent_id = raw_parent_id if isinstance(raw_parent_id, str) and raw_parent_id.strip() else None

        if parent_id and not prefix:
            prefix = chunk_vector_id_prefix(parent_id)

        if not vector_id and not prefix:
            return jsonify({"error": "vectorId, prefix, or parentId required"}), 400

        owner_prefix = f"{uid}-"

        if vector_id:
            if not vector_id.startswith(owner_prefix):
                logger.warning("pinecone delete denied (vid not owned) uid=%s", uid)
                return jsonify({"error": "forbidden"}), 403
            _get_index().delete(ids=[vector_id])
            logger.info("pinecone delete vid uid=%s count=1", uid)
            return jsonify(
                {
                    "status": "success",
                    "message": "Deleted vector",
                    "deletedCount": 1,
                }
            )

        # Prefix delete (e.g. all chunks for one note via parentId).
        assert prefix is not None
        if not prefix.startswith(owner_prefix):
            logger.warning("pinecone delete denied (prefix not owned) uid=%s", uid)
            return jsonify({"error": "forbidden"}), 403

        deleted = delete_vectors_by_id_prefix(_get_index(), uid, prefix)

        logger.info("pinecone delete prefix uid=%s count=%d", uid, deleted)
        return jsonify(
            {
                "status": "success",
                "message": f"Deleted {deleted} vectors",
                "deletedCount": deleted,
            }
        )
    except Exception:
        logger.exception("pinecone delete failed uid=%s", uid)
        return jsonify({"error": "internal_error"}), 500
