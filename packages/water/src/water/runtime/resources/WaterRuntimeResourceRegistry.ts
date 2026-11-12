/** Async content-addressed Water resource borrows with shared ownership and rollback. */
import type { WaterResourceAssetDescriptorV1 } from "../../authoring/body/WaterBodyAuthoringTypes";
import { WaterBodyRegistryError, WaterBodyRegistryErrorCode } from "../body/WaterBodyAssetRegistry";

export interface WaterRuntimeResourceLoadContext {
  readonly signal?: AbortSignal;
  readonly runtimeContext?: unknown;
}

export interface WaterRuntimeResourceFactory {
  readonly descriptor: WaterResourceAssetDescriptorV1;
  load(context: WaterRuntimeResourceLoadContext): unknown | Promise<unknown>;
  destroy?(resource: unknown): void | Promise<void>;
}

export interface WaterRuntimeResourceLease<TResource = unknown> {
  readonly descriptor: WaterResourceAssetDescriptorV1;
  readonly resource: TResource;
  readonly active: boolean;
  destroy(): Promise<void>;
}

interface LoadedWaterResource {
  readonly factory: WaterRuntimeResourceFactory;
  readonly resource: unknown;
  referenceCount: number;
}

interface WaterResourceConsumer {
  resolve(lease: WaterRuntimeResourceLease | undefined): void;
  reject(error: unknown): void;
  detach(): void;
}

interface PendingWaterResource {
  readonly abortController: AbortController;
  readonly consumers: Set<WaterResourceConsumer>;
  settled: boolean;
}

function throwIfAborted(signal: AbortSignal | undefined, message: string): void {
  if (signal?.aborted) throw new DOMException(message, "AbortError");
}

export class WaterRuntimeResourceRegistry {
  private readonly _factories = new Map<string, WaterRuntimeResourceFactory>();
  private readonly _loaded = new Map<string, LoadedWaterResource>();
  private readonly _pending = new Map<string, PendingWaterResource>();
  private readonly _loads = new Set<Promise<void>>();
  private readonly _retirements = new Set<Promise<void>>();
  private readonly _cleanupErrors: unknown[] = [];
  private _destroyed = false;
  private _destroyPromise?: Promise<void>;

  register(factory: WaterRuntimeResourceFactory): void {
    this._assertAvailable();
    const id = factory.descriptor.id;
    if (this._factories.has(id)) {
      throw new WaterBodyRegistryError(
        WaterBodyRegistryErrorCode.DuplicateRegistration,
        "$.id",
        `Water runtime resource '${id}' is already registered.`
      );
    }
    this._factories.set(id, factory);
  }

  /**
   * Installs one content-addressed factory once. An identical descriptor is a
   * no-op; the descriptor identity may never be rebound to different content.
   */
  ensureRegistered(factory: WaterRuntimeResourceFactory): boolean {
    this._assertAvailable();
    const existing = this._factories.get(factory.descriptor.id);
    if (!existing) {
      this.register(factory);
      return true;
    }
    const left = existing.descriptor;
    const right = factory.descriptor;
    if (
      left.schemaVersion !== right.schemaVersion ||
      left.kind !== right.kind ||
      left.contentHash.toLowerCase() !== right.contentHash.toLowerCase() ||
      left.ownership !== right.ownership ||
      left.fallbackPolicy !== right.fallbackPolicy
    ) {
      throw new WaterBodyRegistryError(
        WaterBodyRegistryErrorCode.DuplicateRegistration,
        "$.id",
        `Water runtime resource '${right.id}' is already registered with a different descriptor.`
      );
    }
    // Equal content may be supplied by a new native resource after an asset reload.
    // Existing leases keep their original factory; the next load borrows the current handle.
    this._factories.set(factory.descriptor.id, factory);
    return false;
  }

  async acquire<TResource = unknown>(
    descriptor: WaterResourceAssetDescriptorV1,
    context: WaterRuntimeResourceLoadContext = {}
  ): Promise<WaterRuntimeResourceLease<TResource> | undefined> {
    this._assertAvailable();
    throwIfAborted(context.signal, "Water resource acquisition was aborted.");
    const factory = this._factories.get(descriptor.id);
    if (!factory) {
      if (descriptor.fallbackPolicy === "optional") {
        return undefined;
      }
      throw new WaterBodyRegistryError(
        WaterBodyRegistryErrorCode.MissingResource,
        "$.resources",
        `Water runtime resource '${descriptor.id}' is not registered.`
      );
    }
    if (factory.descriptor.contentHash.toLowerCase() !== descriptor.contentHash.toLowerCase()) {
      throw new WaterBodyRegistryError(
        WaterBodyRegistryErrorCode.ResourceHashMismatch,
        "$.resources.contentHash",
        `Water runtime resource '${descriptor.id}' content hash does not match the resolved asset.`
      );
    }

    const loaded = this._loaded.get(descriptor.id);
    if (loaded) {
      return this._acquireLoaded<TResource>(loaded);
    }
    const existing = this._pending.get(descriptor.id);
    if (existing && !existing.settled && !existing.abortController.signal.aborted) {
      return this._subscribe<TResource>(existing, context.signal);
    }
    const pending: PendingWaterResource = {
      abortController: new AbortController(),
      consumers: new Set(),
      settled: false
    };
    this._pending.set(descriptor.id, pending);
    const result = this._subscribe<TResource>(pending, context.signal);
    const task = this._load(factory, pending, context.runtimeContext).finally(() => {
      if (this._pending.get(descriptor.id) === pending) this._pending.delete(descriptor.id);
      this._loads.delete(task);
    });
    this._loads.add(task);
    // Consumers receive acquisition errors. The task stays tracked so shutdown
    // joins a superseded generation even if its factory ignores cancellation.
    void task.catch(() => {});
    return result;
  }

  destroy(): Promise<void> {
    if (this._destroyPromise) return this._destroyPromise;
    this._destroyed = true;
    for (const entry of this._pending.values()) entry.abortController.abort();
    this._pending.clear();
    this._destroyPromise = (async () => {
      await Promise.allSettled([...this._loads]);
      const loaded = [...this._loaded.values()];
      this._loaded.clear();
      for (const { factory, resource } of loaded) this._retire(factory, resource);
      await Promise.allSettled([...this._retirements]);
      this._factories.clear();
      if (this._cleanupErrors.length)
        throw new AggregateError([...this._cleanupErrors], "Water runtime resource registry cleanup failed.");
    })();
    return this._destroyPromise;
  }

  private async _load(
    factory: WaterRuntimeResourceFactory,
    pending: PendingWaterResource,
    runtimeContext: unknown
  ): Promise<void> {
    let created = false;
    let resource: unknown;
    try {
      resource = await factory.load({ signal: pending.abortController.signal, runtimeContext });
      created = true;
      throwIfAborted(pending.abortController.signal, "Water resource loading was aborted.");
      if (this._destroyed) throw new DOMException("Water resource registry was destroyed.", "AbortError");
      const loaded: LoadedWaterResource = { factory, resource, referenceCount: 0 };
      // Load completion and consumer ownership transfer are one synchronous step.
      // No instance resource can become visible with a zero-reference handoff gap.
      const deliveries = [...pending.consumers].map((consumer) => ({ consumer, lease: this._acquireLoaded(loaded) }));
      this._loaded.set(factory.descriptor.id, loaded);
      pending.settled = true;
      for (const { consumer, lease } of deliveries) {
        consumer.detach();
        consumer.resolve(lease);
      }
      pending.consumers.clear();
    } catch (error) {
      let failure = error,
        rollbackFailed = false;
      if (created) {
        try {
          await this._retire(factory, resource);
        } catch (cleanupError) {
          rollbackFailed = true;
          failure = new AggregateError([error, cleanupError], "Water load rollback cleanup failed.");
        }
      }
      const cancelled = pending.abortController.signal.aborted || this._destroyed;
      const optional =
        factory.descriptor.fallbackPolicy === "optional" &&
        !cancelled &&
        !(failure instanceof DOMException && failure.name === "AbortError") &&
        !rollbackFailed;
      pending.settled = true;
      for (const consumer of pending.consumers) {
        consumer.detach();
        if (optional) consumer.resolve(undefined);
        else consumer.reject(failure);
      }
      pending.consumers.clear();
      if (!optional) throw failure;
    }
  }

  private _subscribe<TResource>(
    pending: PendingWaterResource,
    signal?: AbortSignal
  ): Promise<WaterRuntimeResourceLease<TResource> | undefined> {
    return new Promise((resolve, reject) => {
      const abort = () => {
        consumer.detach();
        pending.consumers.delete(consumer);
        reject(new DOMException("Water resource acquisition was aborted.", "AbortError"));
        if (!pending.settled && pending.consumers.size === 0) pending.abortController.abort();
      };
      const consumer: WaterResourceConsumer = {
        resolve: (lease) => resolve(lease as WaterRuntimeResourceLease<TResource> | undefined),
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

  private _acquireLoaded<TResource = unknown>(loaded: LoadedWaterResource): WaterRuntimeResourceLease<TResource> {
    loaded.referenceCount++;
    return this._createLease<TResource>(loaded);
  }

  private _createLease<TResource>(loaded: LoadedWaterResource): WaterRuntimeResourceLease<TResource> {
    const registry = this;
    let active = true;
    let destroyPromise: Promise<void> | undefined;
    return Object.freeze({
      descriptor: loaded.factory.descriptor,
      resource: loaded.resource as TResource,
      get active() {
        return active && !registry._destroyed;
      },
      destroy: () => {
        if (destroyPromise) return destroyPromise;
        destroyPromise = (async () => {
          if (!active) return;
          active = false;
          loaded.referenceCount = Math.max(0, loaded.referenceCount - 1);
          if (
            loaded.referenceCount === 0 &&
            loaded.factory.descriptor.ownership === "instance" &&
            this._loaded.get(loaded.factory.descriptor.id) === loaded
          ) {
            this._loaded.delete(loaded.factory.descriptor.id);
            await this._retire(loaded.factory, loaded.resource);
          }
        })();
        return destroyPromise;
      }
    });
  }

  /** All registry-owned cleanup remains joinable even after its cache entry is removed. */
  private _retire(factory: WaterRuntimeResourceFactory, resource: unknown): Promise<void> {
    const task = Promise.resolve()
      .then(() => factory.destroy?.(resource))
      .catch((error) => {
        this._cleanupErrors.push(error);
        throw error;
      })
      .finally(() => this._retirements.delete(task));
    this._retirements.add(task);
    // Lease callers receive their own rejection; shutdown reports recorded cleanup failures too.
    void task.catch(() => {});
    return task;
  }

  private _assertAvailable(): void {
    if (this._destroyed) throw new Error("Water runtime resource registry has been destroyed.");
  }
}
