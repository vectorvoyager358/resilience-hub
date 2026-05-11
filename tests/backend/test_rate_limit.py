"""Token bucket smoke tests."""

import time
import unittest

from server.rate_limit import TokenBucketLimiter


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


if __name__ == "__main__":
    unittest.main()
