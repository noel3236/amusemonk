// Token bucket shared by every caller using the same key. Gateway hard limit: 20 rps.
export class TokenBucket {
  private tokens: number;
  private last = Date.now();

  constructor(
    private readonly ratePerSec: number,
    private readonly burst = Math.max(1, Math.floor(ratePerSec))
  ) {
    this.tokens = this.burst;
  }

  async take(): Promise<void> {
    for (;;) {
      const now = Date.now();
      this.tokens = Math.min(this.burst, this.tokens + ((now - this.last) / 1000) * this.ratePerSec);
      this.last = now;
      if (this.tokens >= 1) {
        this.tokens -= 1;
        return;
      }
      const wait = ((1 - this.tokens) / this.ratePerSec) * 1000;
      await new Promise((r) => setTimeout(r, Math.max(5, wait)));
    }
  }
}

const buckets = new Map<string, TokenBucket>();

export function bucketFor(kid: string, ratePerSec: number): TokenBucket {
  let b = buckets.get(kid);
  if (!b) buckets.set(kid, (b = new TokenBucket(ratePerSec)));
  return b;
}
