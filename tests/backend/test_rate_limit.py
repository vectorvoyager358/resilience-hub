"""Token bucket smoke tests."""

import os
import time
import unittest
from unittest.mock import patch

from server.rate_limit import TokenBucketLimiter, _consume_bucket, create_rate_limiter


class TokenBucketTest(unittest.TestCase):
    def test_capacity_then_deny(self):
        rl = TokenBucketLimiter(capacity=3, refill_per_second=0.001)
        self.assertTrue(rl.allow("u1"))
        self.assertTrue(rl.allow("u1"))
        self.assertTrue(rl.allow("u1"))
        self.assertFalse(rl.allow("u1"))

    def test_refill_unblocks(self):
        rl = TokenBucketLimiter(capacity=1, refill_per_second=100.0)
        self.assertTrue(rl.allow("u1"))
        self.assertFalse(rl.allow("u1"))
        time.sleep(0.05)
        self.assertTrue(rl.allow("u1"))

    def test_independent_keys(self):
        rl = TokenBucketLimiter(capacity=1, refill_per_second=0.001)
        self.assertTrue(rl.allow("u1"))
        self.assertTrue(rl.allow("u2"))
        self.assertFalse(rl.allow("u1"))

    def test_shared_bucket_math_refills_and_consumes(self):
        allowed, remaining = _consume_bucket(
            tokens=0.0,
            updated_at=10.0,
            now=12.0,
            capacity=5.0,
            refill=2.0,
            cost=3.0,
        )
        self.assertTrue(allowed)
        self.assertEqual(remaining, 1.0)

    def test_factory_defaults_to_memory(self):
        with patch.dict(os.environ, {"RATE_LIMIT_BACKEND": "memory"}, clear=False):
            limiter = create_rate_limiter(scope="test", capacity=1, refill_per_second=1)
        self.assertIsInstance(limiter, TokenBucketLimiter)


if __name__ == "__main__":
    unittest.main()
