const OPEN_MS = 5 * 60 * 1000;

// A 401/403 means that user's key is wrong or disabled: every payout signed with it would fail the same way.
// Pause only that user, not everyone.
export class CircuitBreaker {
  private until = new Map<string, number>();

  open(userId: string, detail: string) {
    const reopenAt = Date.now() + OPEN_MS;
    this.until.set(userId, reopenAt);
    console.error(`[worker] CIRCUIT OPEN for user ${userId} until ${new Date(reopenAt).toISOString()}: ${detail}`);
  }

  isOpen(userId: string): boolean {
    const t = this.until.get(userId);
    if (t === undefined) return false;
    if (Date.now() >= t) {
      this.until.delete(userId);
      return false;
    }
    return true;
  }

  openUsers(): string[] {
    return [...this.until.keys()].filter((u) => this.isOpen(u));
  }
}
