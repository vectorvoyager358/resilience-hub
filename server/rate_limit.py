"""Per-key token buckets with memory and optional shared Firestore backends."""

from __future__ import annotations

import hashlib
import logging
import os
import threading
import time
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Dict, Protocol

logger = logging.getLogger(__name__)


@dataclass
class _Bucket:
    tokens: float
    updated_at: float


class RateLimiter(Protocol):
    def allow(self, key: str, *, cost: float = 1.0) -> bool: ...

    def reset(self) -> None: ...


def _consume_bucket(
    *, tokens: float, updated_at: float, now: float,
    capacity: float, refill: float, cost: float,
) -> tuple[bool, float]:
    available = min(capacity, tokens + max(0.0, now - updated_at) * refill)
    if available >= cost:
        return True, available - cost
    return False, available


class TokenBucketLimiter:
    """Per-key token bucket. Thread-safe."""

    def __init__(self, *, capacity: int, refill_per_second: float) -> None:
        if capacity <= 0:
            raise ValueError("capacity must be positive")
        if refill_per_second <= 0:
            raise ValueError("refill_per_second must be positive")
        self._capacity = float(capacity)
        self._refill = float(refill_per_second)
        self._buckets: Dict[str, _Bucket] = {}
        self._lock = threading.Lock()

    def allow(self, key: str, *, cost: float = 1.0) -> bool:
        if not key:
            return False
        now = time.monotonic()
        with self._lock:
            bucket = self._buckets.get(key)
            if bucket is None:
                bucket = _Bucket(tokens=self._capacity, updated_at=now)
                self._buckets[key] = bucket
            else:
                elapsed = max(0.0, now - bucket.updated_at)
                bucket.tokens = min(self._capacity, bucket.tokens + elapsed * self._refill)
                bucket.updated_at = now
            if bucket.tokens >= cost:
                bucket.tokens -= cost
                return True
            return False

    def reset(self) -> None:
        with self._lock:
            self._buckets.clear()


class FirestoreTokenBucketLimiter:
    """Transactional token bucket shared by all service instances."""

    def __init__(self, *, scope: str, capacity: int, refill_per_second: float) -> None:
        if not scope.strip():
            raise ValueError("scope is required")
        if capacity <= 0 or refill_per_second <= 0:
            raise ValueError("capacity and refill_per_second must be positive")
        self._scope = scope.strip()
        self._capacity = float(capacity)
        self._refill = float(refill_per_second)
        self._fail_open = (os.environ.get("RATE_LIMIT_FAIL_OPEN") or "").lower() in (
            "1", "true", "yes", "on"
        )

    def _document_id(self, key: str) -> str:
        return hashlib.sha256(f"{self._scope}:{key}".encode("utf-8")).hexdigest()

    def allow(self, key: str, *, cost: float = 1.0) -> bool:
        if not key or cost <= 0:
            return False
        try:
            from google.cloud import firestore

            client = firestore.Client()
            ref = client.collection("_rate_limits").document(self._document_id(key))
            transaction = client.transaction()
            now = time.time()

            @firestore.transactional
            def consume(txn):
                snapshot = ref.get(transaction=txn)
                data = snapshot.to_dict() if snapshot.exists else {}
                tokens = data.get("tokens", self._capacity)
                updated_at = data.get("updatedAt", now)
                if not isinstance(tokens, (int, float)):
                    tokens = self._capacity
                if not isinstance(updated_at, (int, float)):
                    updated_at = now
                allowed, remaining = _consume_bucket(
                    tokens=float(tokens), updated_at=float(updated_at), now=now,
                    capacity=self._capacity, refill=self._refill, cost=cost,
                )
                refill_window = max(3600.0, self._capacity / self._refill * 2)
                txn.set(ref, {
                    "scope": self._scope,
                    "tokens": remaining,
                    "updatedAt": now,
                    "expiresAt": datetime.now(timezone.utc) + timedelta(seconds=refill_window),
                })
                return allowed

            return bool(consume(transaction))
        except Exception:
            logger.exception("Shared rate limiter failed scope=%s", self._scope)
            return self._fail_open

    def reset(self) -> None:
        # Shared production buckets expire through a Firestore TTL policy.
        return None


def create_rate_limiter(
    *, scope: str, capacity: int, refill_per_second: float
) -> RateLimiter:
    backend = (os.environ.get("RATE_LIMIT_BACKEND") or "memory").strip().lower()
    if backend == "memory":
        return TokenBucketLimiter(capacity=capacity, refill_per_second=refill_per_second)
    if backend == "firestore":
        return FirestoreTokenBucketLimiter(
            scope=scope, capacity=capacity, refill_per_second=refill_per_second
        )
    raise ValueError(f"Unsupported RATE_LIMIT_BACKEND: {backend}")
