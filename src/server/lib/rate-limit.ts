/**
 * Fixed-window, in-memory counter keyed by client. Used two ways:
 * - `hit` + `retryAfter` on every call: a general request budget
 * - `hit` only on failed lookups: blocks brute-forcing of booking references and Stay IDs
 * In-memory is fine for one instance; several instances would share a Redis counter.
 */
export class RateLimiter {
  private windows = new Map<string, { start: number; count: number }>();

  constructor(
    readonly limit: number,
    private windowMs = 60_000,
  ) {}

  hit(key: string, now = Date.now()): void {
    const w = this.windows.get(key);
    if (!w || now - w.start >= this.windowMs) {
      this.windows.set(key, { start: now, count: 1 });
      if (this.windows.size > 10_000) this.sweep(now);
    } else {
      w.count++;
    }
  }

  /** Seconds until the key may try again, or 0 if it is within its budget. */
  retryAfter(key: string, now = Date.now()): number {
    const w = this.windows.get(key);
    if (!w || now - w.start >= this.windowMs || w.count <= this.limit) return 0;
    return Math.ceil((w.start + this.windowMs - now) / 1000);
  }

  private sweep(now: number) {
    for (const [k, w] of this.windows) if (now - w.start >= this.windowMs) this.windows.delete(k);
  }
}
