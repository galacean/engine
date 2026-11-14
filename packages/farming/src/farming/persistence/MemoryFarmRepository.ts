import type { FarmSnapshot } from "../domain/index";
import type { FarmRepository, FarmRepositoryTransaction } from "./FarmRepository";

export class MemoryFarmRepository implements FarmRepository {
  private readonly records = new Map<string, FarmSnapshot>();
  private readonly listeners = new Map<string, Set<() => void>>();
  private queue: Promise<unknown> = Promise.resolve();
  failNextTransaction = false;

  async read(farmId: string): Promise<FarmSnapshot | undefined> {
    return this.records.get(farmId);
  }

  transact<T>(
    farmId: string,
    createInitial: () => FarmSnapshot,
    operation: (current: FarmSnapshot) => FarmRepositoryTransaction<T>,
    signal?: AbortSignal
  ): Promise<T> {
    const task = this.queue.then(() => {
      signal?.throwIfAborted();
      if (this.failNextTransaction) {
        this.failNextTransaction = false;
        throw new Error("Injected storage failure");
      }
      const current = this.records.get(farmId) ?? createInitial();
      const result = operation(current);
      const changed = result.snapshot !== current || !this.records.has(farmId);
      this.records.set(farmId, result.snapshot);
      if (changed)
        for (const listener of [...(this.listeners.get(farmId) ?? [])]) {
          try {
            listener();
          } catch (error) {
            console.warn("Farm committed; subscriber notification failed", error);
          }
        }
      return result.value;
    });
    this.queue = task.catch(() => undefined);
    return task;
  }

  subscribe(farmId: string, listener: () => void): () => void {
    let listeners = this.listeners.get(farmId);
    if (!listeners) this.listeners.set(farmId, (listeners = new Set()));
    listeners.add(listener);
    return () => {
      listeners!.delete(listener);
      if (!listeners!.size) this.listeners.delete(farmId);
    };
  }

  dispose(): void {
    this.listeners.clear();
  }

  seed(snapshot: FarmSnapshot): void {
    this.records.set(snapshot.farmId, snapshot);
  }
}
