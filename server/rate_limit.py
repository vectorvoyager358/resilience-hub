"""In-memory per-key token bucket rate limiter.

Resets per Cloud Run instance, which is acceptable at this scale because each
instance still caps abusive callers and Cloud Run autoscaling concurrency
keeps total fan-out bounded. Swap for Firestore/Redis if you need durable
limits across instances.
"""

from __future__ import annotations

import threading
import time
from dataclasses import dataclass
from typing import Dict


@dataclass
class _Bucket:
    tokens: float
    updated_at: float


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
