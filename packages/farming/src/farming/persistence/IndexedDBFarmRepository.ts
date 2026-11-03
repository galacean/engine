import type { FarmSnapshot } from "../domain/index";
import type { FarmRepository, FarmRepositoryTransaction } from "./FarmRepository";

const DATABASE_VERSION = 1;
const STORE_NAME = "farm-snapshots";
const CHANNEL_NAME = "galacean-farming-state";
const CHANNEL_MESSAGE_VERSION = 4;

export class IndexedDBFarmRepository implements FarmRepository {
  private readonly listeners = new Map<string, Set<() => void>>();
  private readonly channel: BroadcastChannel | null;
  private databasePromise: Promise<IDBDatabase> | null = null;
  private disposed = false;

  constructor(private readonly databaseName = "galacean-farming") {
    this.channel = typeof BroadcastChannel === "function" ? new BroadcastChannel(CHANNEL_NAME) : null;
    if (this.channel) {
      this.channel.onmessage = (event: MessageEvent<{ version?: number; farmId?: string }>) => {
        if (event.data?.version !== CHANNEL_MESSAGE_VERSION) return;
        const farmId = event.data?.farmId;
        if (farmId) this.notify(farmId);
      };
    }
  }

  async read(farmId: string): Promise<FarmSnapshot | undefined> {
    const database = await this.openDatabase();
    const transaction = database.transaction(STORE_NAME, "readonly");
    const done = transactionDone(transaction);
    const request = transaction.objectStore(STORE_NAME).get(farmId);
    const result = await requestValue<FarmSnapshot | undefined>(request);
    await done;
    return result;
  }

  async transact<T>(
    farmId: string,
    createInitial: () => FarmSnapshot,
    operation: (current: FarmSnapshot) => FarmRepositoryTransaction<T>,
    signal?: AbortSignal
  ): Promise<T> {
    const database = await this.openDatabase();
    signal?.throwIfAborted();
    const transaction = database.transaction(STORE_NAME, "readwrite");
    const done = transactionDone(transaction);
    const cancel = () => {
      try {
        transaction.abort();
      } catch {
        /* A completed transaction cannot be cancelled. */
      }
    };
    signal?.addEventListener("abort", cancel, { once: true });
    const store = transaction.objectStore(STORE_NAME);
    try {
      const stored = await requestValue<FarmSnapshot | undefined>(store.get(farmId));
      signal?.throwIfAborted();
      const current = stored ?? createInitial();
      const result = operation(current);
      const changed = result.snapshot !== current || stored === undefined;
      if (changed) await requestValue(store.put(result.snapshot));
      await done;
      if (changed) {
        this.notify(farmId);
        try {
          this.channel?.postMessage({ version: CHANNEL_MESSAGE_VERSION, farmId, revision: result.snapshot.revision });
        } catch (error) {
          console.warn("Farm committed; cross-page notification failed", error);
        }
      }
      return result.value;
    } catch (error) {
      try {
        transaction.abort();
      } catch {
        // The transaction may already have failed or completed.
      }
      // Consume the abort completion too; a failed put must not leak an unhandled rejection.
      await done.catch(() => undefined);
      if (signal?.aborted) signal.throwIfAborted();
      throw error;
    } finally {
      signal?.removeEventListener("abort", cancel);
    }
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
    if (this.disposed) return;
    this.disposed = true;
    this.channel?.close();
    this.listeners.clear();
    void this.databasePromise?.then((database) => database.close());
  }

  private notify(farmId: string): void {
    for (const listener of [...(this.listeners.get(farmId) ?? [])]) {
      try {
        listener();
      } catch (error) {
        console.warn("Farm committed; subscriber notification failed", error);
      }
    }
  }

  private openDatabase(): Promise<IDBDatabase> {
    if (this.disposed) return Promise.reject(new Error("Farm repository has been disposed."));
    if (this.databasePromise) return this.databasePromise;
    this.databasePromise = new Promise((resolve, reject) => {
      if (typeof indexedDB === "undefined") {
        reject(new Error("This browser does not provide IndexedDB."));
        return;
      }
      const request = indexedDB.open(this.databaseName, DATABASE_VERSION);
      request.onupgradeneeded = () => {
        const database = request.result;
        database.createObjectStore(STORE_NAME, { keyPath: "farmId" });
      };
      request.onsuccess = () => {
        const database = request.result;
        database.onversionchange = () => database.close();
        resolve(database);
      };
      request.onerror = () => reject(request.error ?? new Error("Unable to open the farm database."));
      request.onblocked = () => reject(new Error("Farm database upgrade is blocked by another page."));
    });
    this.databasePromise.catch(() => (this.databasePromise = null));
    return this.databasePromise;
  }
}

function requestValue<T = IDBValidKey>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB request failed."));
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error ?? new Error("IndexedDB transaction was aborted."));
    transaction.onerror = () => reject(transaction.error ?? new Error("IndexedDB transaction failed."));
  });
}
