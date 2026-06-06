"""Index user content into Pinecone with optional multi-chunk splitting (#76)."""

from __future__ import annotations

import logging
from concurrent.futures import ThreadPoolExecutor
from typing import Any, Dict, List, Tuple

from server.text_chunking import MAX_INDEX_CHUNKS, split_text_for_indexing

logger = logging.getLogger(__name__)

_EMBED_DIM = 768
_DELETE_BATCH_SIZE = 100
_MAX_PREFIX_FETCH = 10000


def parent_id_for(uid: str, metadata: Dict[str, Any]) -> str | None:
    """Stable id for a logical note / reflection / challenge row."""
    type_str = metadata.get("type")
    if type_str == "note":
        cid = metadata.get("challengeId")
        day = metadata.get("dayNumber")
        if isinstance(cid, str) and cid.strip() and day is not None:
            return f"{uid}-note-{cid.strip()}-{int(day)}"
    if type_str == "reflection":
        date_val = metadata.get("date")
        if isinstance(date_val, str) and date_val.strip():
            return f"{uid}-reflection-{date_val.strip()}"
    if type_str == "challenge":
        cid = metadata.get("challengeId")
        if isinstance(cid, str) and cid.strip():
            return f"{uid}-challenge-{cid.strip()}"
    return None


def vector_id_for_chunk(parent_id: str, chunk_index: int) -> str:
    return f"{parent_id}-c{chunk_index}"


def chunk_vector_id_prefix(parent_id: str) -> str:
    return f"{parent_id}-c"


def delete_parent_chunks(index: Any, uid: str, parent_id: str) -> None:
    """Delete chunk vectors `{parent_id}-c0..c{N}` without a slow index scan."""
    if not parent_id.startswith(f"{uid}-"):
        return
    ids = [vector_id_for_chunk(parent_id, i) for i in range(MAX_INDEX_CHUNKS)]
    for i in range(0, len(ids), _DELETE_BATCH_SIZE):
        batch = ids[i : i + _DELETE_BATCH_SIZE]
        if batch:
            index.delete(ids=batch)


def delete_vectors_by_id_prefix(index: Any, uid: str, id_prefix: str) -> int:
    """Delete vectors by id prefix. Chunk parents use direct id delete (fast path)."""
    if not id_prefix.startswith(f"{uid}-"):
        return 0
    if id_prefix.endswith("-c"):
        parent_id = id_prefix[:-2]
        delete_parent_chunks(index, uid, parent_id)
        return MAX_INDEX_CHUNKS

    fetch_response = index.query(
        vector=[0.0] * _EMBED_DIM,
        top_k=_MAX_PREFIX_FETCH,
        include_metadata=False,
        filter={"user_id": uid},
    )
    ids = [
        match.id
        for match in getattr(fetch_response, "matches", []) or []
        if isinstance(getattr(match, "id", None), str) and match.id.startswith(id_prefix)
    ]
    deleted = 0
    for i in range(0, len(ids), _DELETE_BATCH_SIZE):
        batch = ids[i : i + _DELETE_BATCH_SIZE]
        if batch:
            index.delete(ids=batch)
            deleted += len(batch)
    return deleted


def _embed_chunks(chunks: List[str]) -> List[List[float]]:
    from server.gemini_client import embed_document_text

    if len(chunks) <= 1:
        return [embed_document_text(chunks[0])] if chunks else []

    workers = min(4, len(chunks))
    out: List[List[float] | None] = [None] * len(chunks)
    with ThreadPoolExecutor(max_workers=workers) as pool:
        futures = {pool.submit(embed_document_text, text): i for i, text in enumerate(chunks)}
        for fut in futures:
            out[futures[fut]] = fut.result()
    if any(v is None for v in out):
        raise RuntimeError("embedding_failed")
    return [v for v in out if v is not None]


def index_content_chunks(
    index: Any,
    *,
    uid: str,
    content: str,
    metadata: Dict[str, Any],
) -> Tuple[str, int]:
    """
    Replace prior chunks for this parent_id, embed each chunk, upsert to Pinecone.

    Returns (primary_vector_id, chunk_count).
    """
    parent = parent_id_for(uid, metadata)
    if not parent:
        raise ValueError("metadata_missing_parent_key")

    chunks = split_text_for_indexing(content)
    if not chunks:
        raise ValueError("content_empty")

    logger.info(
        "index_content start uid=%s parent=%s chars=%d chunks=%d",
        uid,
        parent,
        len(content),
        len(chunks),
    )

    delete_parent_chunks(index, uid, parent)

    chunk_vectors = _embed_chunks(chunks)
    if len(chunk_vectors) != len(chunks):
        raise RuntimeError("embedding_failed")

    vectors: List[tuple[str, list[float], Dict[str, Any]]] = []
    chunk_count = len(chunks)
    for idx, chunk_text in enumerate(chunks):
        md = dict(metadata)
        md["content"] = chunk_text
        md["parent_id"] = parent
        md["chunk_index"] = idx
        md["chunk_count"] = chunk_count
        vid = vector_id_for_chunk(parent, idx)
        vectors.append((vid, chunk_vectors[idx], md))

    index.upsert(vectors=vectors)
    primary_id = vector_id_for_chunk(parent, 0)
    logger.info(
        "index_content ok uid=%s parent=%s chunks=%d primary=%s",
        uid,
        parent,
        chunk_count,
        primary_id,
    )
    return primary_id, chunk_count
