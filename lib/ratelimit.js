'use strict';
// Fixed-window rate limiter with optional lockout, in memory.

function createLimiter({ windowMs, max, lockMs = 0 }) {
  const buckets = new Map();

  setInterval(() => {
    const t = Date.now();
    for (const [k, b] of buckets) if (b.resetAt < t && (!b.lockedUntil || b.lockedUntil < t)) buckets.delete(k);
  }, Math.max(windowMs, 30_000)).unref();

  return {
    /** Returns { allowed, remaining, retryAfterMs, justLocked } */
    hit(key) {
      const t = Date.now();
      let b = buckets.get(key);
      if (b && b.lockedUntil && b.lockedUntil > t) {
        return { allowed: false, remaining: 0, retryAfterMs: b.lockedUntil - t, justLocked: false };
      }
      if (!b || b.resetAt <= t || (b.lockedUntil && b.lockedUntil <= t)) {
        b = { count: 0, resetAt: t + windowMs, lockedUntil: 0 };
        buckets.set(key, b);
      }
      b.count += 1;
      if (b.count > max) {
        let justLocked = false;
        if (lockMs) {
          b.lockedUntil = t + lockMs;
          justLocked = true;
        }
        return { allowed: false, remaining: 0, retryAfterMs: (lockMs ? b.lockedUntil : b.resetAt) - t, justLocked };
      }
      return { allowed: true, remaining: max - b.count, retryAfterMs: 0, justLocked: false };
    },
    reset(key) { buckets.delete(key); },
  };
}

module.exports = { createLimiter };
