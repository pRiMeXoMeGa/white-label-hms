/**
 * Fixed-window, in-memory counter keyed by client. Used two ways:
 * - `hit` + `retryAfter` on every call: a general request budget
 * - `hit` only on failed lookups: blocks brute-forcing of booking references and Stay IDs
 * In-memory is fine for one instance; several instances would share a Redis counter.
 * The map is bounded: expired windows are swept at most once a second, and if it is still
 * over `maxKeys` the oldest keys are dropped, so spoofed keys cannot grow memory without limit.
 */
export class RateLimiter {
  private windows = new Map<string, { start: number; count: number }>();
  private lastSweep = 0;

  constructor(
    readonly limit: number,
    private windowMs = 60_000,
    private maxKeys = 50_000,
  ) {}

  hit(key: string, now = Date.now()): void {
    const w = this.windows.get(key);
    if (!w || now - w.start >= this.windowMs) {
      this.windows.delete(key);
      this.windows.set(key, { start: now, count: 1 });
      if (this.windows.size > this.maxKeys) this.trim(now);
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

  /** Seconds a key stays blocked once it has used up `limit` hits (for counters hit after the fact). */
  blockedFor(key: string, now = Date.now()): number {
    const w = this.windows.get(key);
    if (!w || now - w.start >= this.windowMs || w.count < this.limit) return 0;
    return Math.ceil((w.start + this.windowMs - now) / 1000);
  }

  get size() {
    return this.windows.size;
  }

  private trim(now: number) {
    if (now - this.lastSweep >= 1000) {
      this.lastSweep = now;
      for (const [k, w] of this.windows) if (now - w.start >= this.windowMs) this.windows.delete(k);
    }
    // Map keeps insertion order, so the first keys are the oldest windows.
    for (const k of this.windows.keys()) {
      if (this.windows.size <= this.maxKeys) break;
      this.windows.delete(k);
    }
  }
}

/** Remembers recently resolved codes (bounded, oldest dropped first). */
export class RecentSet {
  private items = new Map<string, number>();

  constructor(
    private ttlMs = 24 * 60 * 60_000,
    private maxItems = 20_000,
  ) {}

  add(key: string, now = Date.now()) {
    this.items.delete(key);
    this.items.set(key, now);
    for (const k of this.items.keys()) {
      if (this.items.size <= this.maxItems) break;
      this.items.delete(k);
    }
  }

  has(key: string, now = Date.now()): boolean {
    const at = this.items.get(key);
    return at !== undefined && now - at < this.ttlMs;
  }
}
