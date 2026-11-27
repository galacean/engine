/** Bounded, abort-aware cache for immutable compiled Water resources. */
import type { WaterCompiledResource } from "../../compiler/body/WaterCompiledResource";

export interface WaterCompileCacheOptions {
  readonly entryLimit: number;
  readonly budgetBytes: number;
}

export interface WaterCompileCacheRequest {
  readonly key: string;
  readonly signal?: AbortSignal;
  readonly compile: (signal: AbortSignal) => WaterCompiledResource | Promise<WaterCompiledResource>;
  readonly validate: (resource: WaterCompiledResource) => void;
  readonly createBudgetExceededError: (resourceBytes: number, budgetBytes: number) => Error;
}

/** One consumer owns this reference from delivery until release, independently of the LRU. */
export interface WaterCompiledResourceLease {
  readonly resource: WaterCompiledResource;
  release(): void;
}

interface WaterCompileConsumer {
  resolve(lease: WaterCompiledResourceLease): void;
  reject(error: unknown): void;
  detach(): void;
}

interface PendingWaterCompile {
  promise: Promise<void>;
  readonly abortController: AbortController;
  readonly consumers: Set<WaterCompileConsumer>;
  settled: boolean;
}

function requirePositiveInteger(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value <= 0) throw new RangeError(`${label} must be a positive integer.`);
  return value;
}

interface WaterCompileCacheEntry {
  readonly resource: WaterCompiledResource;
  consumerCount: number;
  cached: boolean;
}

function createLease(entry: WaterCompileCacheEntry): WaterCompiledResourceLease {
  const { resource } = entry;
  resource.retain();
  entry.consumerCount++;
  let active = true;
  return Object.freeze({
    resource,
    release() {
      if (!active) return;
      active = false;
      resource.release();
      entry.consumerCount--;
      if (!entry.cached && entry.consumerCount === 0) resource.dispose();
    }
  });
}

function releaseCacheEntry(entry: WaterCompileCacheEntry): void {
  entry.cached = false;
  entry.resource.release();
  // A delivered consumer may still be preparing a backend which creates its
  // own child references. Disposal is requested only when that lease retires.
  if (entry.consumerCount === 0) entry.resource.dispose();
}

export class WaterCompileCache {
  private readonly _entryLimit: number;
  private readonly _budgetBytes: number;
  private readonly _cache = new Map<string, WaterCompileCacheEntry>();
  private readonly _pending = new Map<string, PendingWaterCompile>();
  private readonly _compilations = new Set<Promise<void>>();
  private _generation = 0;

  constructor(options: Readonly<WaterCompileCacheOptions>) {
    this._entryLimit = requirePositiveInteger(options.entryLimit, "Water body compile-cache entry limit");
    this._budgetBytes = requirePositiveInteger(options.budgetBytes, "Water body compile-cache byte budget");
  }

  acquire(request: Readonly<WaterCompileCacheRequest>): Promise<WaterCompiledResourceLease> {
    if (request.key.trim().length === 0) throw new TypeError("Water compile-cache key must be non-empty.");
    if (request.signal?.aborted)
      return Promise.reject(new DOMException("Water body activation was aborted.", "AbortError"));
    const cached = this._cache.get(request.key);
    if (cached && !cached.resource.isDisposed && !cached.resource.disposeRequested) {
      this._cache.delete(request.key);
      this._cache.set(request.key, cached);
      return Promise.resolve(createLease(cached));
    }
    if (cached) {
      this._cache.delete(request.key);
      if (!cached.resource.isDisposed) releaseCacheEntry(cached);
    }
    const existing = this._pending.get(request.key);
    if (existing && !existing.settled && !existing.abortController.signal.aborted) {
      return this._subscribe(existing, request.signal);
    }
    const generation = this._generation;
    const pending: PendingWaterCompile = {
      promise: Promise.resolve(),
      abortController: new AbortController(),
      consumers: new Set(),
      settled: false
    };
    this._pending.set(request.key, pending);
    const result = this._subscribe(pending, request.signal);
    let compilation: WaterCompiledResource | Promise<WaterCompiledResource>;
    try {
      compilation = request.compile(pending.abortController.signal);
    } catch (error) {
      compilation = Promise.reject(error);
    }
    pending.promise = Promise.resolve(compilation)
      .then((resource) => {
        const leases: WaterCompiledResourceLease[] = [];
        const entry: WaterCompileCacheEntry = { resource, consumerCount: 0, cached: false };
        try {
          pending.abortController.signal.throwIfAborted();
          if (generation !== this._generation)
            throw new DOMException("Water body compilation was invalidated.", "AbortError");
          request.validate(resource);
          if (resource.memory.totalBytes > this._budgetBytes)
            throw request.createBudgetExceededError(resource.memory.totalBytes, this._budgetBytes);
          // Reserve every consumer's ownership before LRU eviction can request disposal.
          // Promise reactions run later and must never be responsible for this handoff.
          for (const consumer of pending.consumers) leases.push(createLease(entry));
          resource.retain();
          entry.cached = true;
          this._cache.set(request.key, entry);
          this._evict(request.key);
          pending.settled = true;
          let index = 0;
          for (const consumer of pending.consumers) {
            consumer.detach();
            consumer.resolve(leases[index++]);
          }
          pending.consumers.clear();
        } catch (error) {
          if (entry.cached) {
            if (this._cache.get(request.key) === entry) this._cache.delete(request.key);
            releaseCacheEntry(entry);
          }
          for (const lease of leases) lease.release();
          resource.dispose();
          throw error;
        }
      })
      .catch((error) => {
        pending.settled = true;
        for (const consumer of pending.consumers) {
          consumer.detach();
          consumer.reject(error);
        }
        pending.consumers.clear();
        throw error;
      })
      .finally(() => {
        if (this._pending.get(request.key) === pending) this._pending.delete(request.key);
        this._compilations.delete(pending.promise);
      });
    this._compilations.add(pending.promise);
    // The consumer promises deliver failures; retaining the task also lets shutdown join late generations.
    void pending.promise.catch(() => {});
    return result;
  }

  /** Invalidates all pending generations, including already-cancelled same-key predecessors. */
  abortPending(): readonly Promise<void>[] {
    this._generation++;
    for (const pending of this._pending.values()) pending.abortController.abort();
    this._pending.clear();
    return Object.freeze([...this._compilations]);
  }

  clear(): void {
    this.abortPending();
    for (const entry of this._cache.values()) releaseCacheEntry(entry);
    this._cache.clear();
  }

  private _subscribe(
    pending: PendingWaterCompile,
    signal: AbortSignal | undefined
  ): Promise<WaterCompiledResourceLease> {
    return new Promise((resolve, reject) => {
      const abort = () => {
        consumer.detach();
        pending.consumers.delete(consumer);
        reject(new DOMException("Water body activation was aborted.", "AbortError"));
        if (!pending.settled && pending.consumers.size === 0) pending.abortController.abort();
      };
      const consumer: WaterCompileConsumer = {
        resolve,
        reject,
        detach: () => {
          signal?.removeEventListener("abort", abort);
          pending.abortController.signal.removeEventListener("abort", abort);
        }
      };
      pending.consumers.add(consumer);
      signal?.addEventListener("abort", abort, { once: true });
      pending.abortController.signal.addEventListener("abort", abort, { once: true });
      if (signal?.aborted || pending.abortController.signal.aborted) abort();
    });
  }

  private _evict(protectedKey: string): void {
    const totalBytes = (): number => {
      let bytes = 0;
      for (const { resource } of this._cache.values()) bytes += resource.memory.totalBytes;
      return bytes;
    };
    while (this._cache.size > this._entryLimit || totalBytes() > this._budgetBytes) {
      const oldestKey = this._cache.keys().next().value as string | undefined;
      if (oldestKey === undefined || (oldestKey === protectedKey && this._cache.size === 1)) break;
      const evictionKey = oldestKey === protectedKey ? [...this._cache.keys()][1] : oldestKey;
      if (!evictionKey) break;
      const entry = this._cache.get(evictionKey);
      this._cache.delete(evictionKey);
      if (entry) {
        releaseCacheEntry(entry);
      }
    }
  }
}
