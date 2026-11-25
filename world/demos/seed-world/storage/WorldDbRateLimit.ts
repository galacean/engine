import type { WorldDb } from "./SharedWorldStorage";

// The scaffold retains a timestamp at the exact 1000 ms boundary.
const nextWindowMs = 1001;
const maxStarts = 10;

class ActionBudget {
  private readonly starts: number[] = [];
  private resumeAt = 0;
  private turn = Promise.resolve();

  private async waitForSlot(): Promise<void> {
    for (;;) {
      const now = Date.now();
      while (this.starts.length && this.starts[0] + nextWindowMs <= now) this.starts.shift();
      const oldestExpires = this.starts.length >= maxStarts ? this.starts[0] + nextWindowMs : 0;
      const delay = Math.max(this.resumeAt, oldestExpires) - now;
      if (delay <= 0) return;
      await new Promise<void>((resolve) => setTimeout(resolve, delay));
    }
  }

  private start<T>(call: () => Promise<T>, signal?: AbortSignal): Promise<T> {
    // Queue dispatch only. A slow response must not hold up other requests with available slots.
    return new Promise<T>((resolve, reject) => {
      this.turn = this.turn
        .then(async () => {
          signal?.throwIfAborted();
          await this.waitForSlot();
          signal?.throwIfAborted();
          resolve(call());
          this.starts.push(Date.now());
        })
        .catch(reject);
    });
  }

  async run<T>(call: () => Promise<T>, scaffoldAction?: string, signal?: AbortSignal): Promise<T> {
    for (let attempt = 0; ; attempt++) {
      try {
        return await this.start(call, signal);
      } catch (error) {
        // Other callers in this page may have spent part of the scaffold's budget.
        // Only this local rejection guarantees that even a write did not reach the DB.
        const refusal = error as { code?: string; message?: string } | null;
        if (
          !scaffoldAction ||
          refusal?.code !== "RATE_LIMIT" ||
          refusal.message !== `[window.lingguang._call] rate limit exceeded: ${scaffoldAction}`
        )
          throw error;
        this.resumeAt = Date.now() + nextWindowMs;
        if (attempt >= 1) throw error;
      }
    }
  }
}

export function scheduleWorldDb(db: WorldDb, usesScaffold: boolean): WorldDb {
  const queries = new ActionBudget();
  const writes = new ActionBudget();
  return {
    role: () => db.role(),
    query: (request, signal) =>
      queries.run(() => db.query(request), usesScaffold ? "lingguang.db.query" : undefined, signal),
    execute: (request) => writes.run(() => db.execute(request), usesScaffold ? "lingguang.db.execute" : undefined)
  };
}
