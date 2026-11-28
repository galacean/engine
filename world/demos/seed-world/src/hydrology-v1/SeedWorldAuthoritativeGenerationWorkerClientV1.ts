import {
  type SeedWorldAuthoritativeGenerationBuildResultV1,
  type SeedWorldAuthoritativeGenerationWorkerInputV1
} from "./SeedWorldAuthoritativeGenerationBuilderV1.ts";
import { seedWorldHeightBrushAssetUrl } from "../SeedWorldHeightBrushAssetUrl.ts";
import {
  hydrateSeedWorldAuthoritativeGenerationV1,
  type SeedWorldTransferredAuthoritativeGenerationV1
} from "./SeedWorldAuthoritativeGenerationTransferV1.ts";
import type { SeedWorldAuthoritativeGenerationWorkerResponseV1 } from "./SeedWorldAuthoritativeGenerationWorker.ts";
import SeedWorldAuthoritativeGenerationWorker from "./SeedWorldAuthoritativeGenerationWorker.ts?worker&inline";
import type { SeedWorldUint16TilePool } from "@galacean/engine-world-planning/world/SeedWorldGridTileSnapshot";

export interface SeedWorldAuthoritativeGenerationWorkerBuildInputV1
  extends SeedWorldAuthoritativeGenerationWorkerInputV1 {
  readonly heightTilePool: SeedWorldUint16TilePool;
  readonly ownershipTilePool: SeedWorldUint16TilePool;
  readonly signal: AbortSignal;
}

interface PendingAuthoritativeGenerationV1 {
  readonly id: number;
  readonly signal: AbortSignal;
  readonly heightTilePool: SeedWorldUint16TilePool;
  readonly ownershipTilePool: SeedWorldUint16TilePool;
  readonly resolve: (result: SeedWorldAuthoritativeGenerationBuildResultV1) => void;
  readonly reject: (reason: unknown) => void;
  readonly onAbort: () => void;
  readonly workerInput: SeedWorldAuthoritativeGenerationWorkerInputV1;
  requestPublished: boolean;
}

/**
 * Owns the isolated authoritative compiler Worker. Abort hard-terminates its current epoch, which
 * interrupts synchronous Topology/Bake/Sealer code without waiting for the Worker's event loop.
 */
export class SeedWorldAuthoritativeGenerationWorkerClientV1 {
  private _worker?: Worker;
  private _pending?: PendingAuthoritativeGenerationV1;
  private _workerReady = false;
  private readonly _heightBrushUrl = seedWorldHeightBrushAssetUrl().href;
  private _nextId = 1;
  private _destroyed = false;

  build(
    input: Readonly<SeedWorldAuthoritativeGenerationWorkerBuildInputV1>
  ): Promise<SeedWorldAuthoritativeGenerationBuildResultV1> {
    if (this._destroyed) {
      return Promise.reject(new Error("Seed World authoritative generation Worker has been destroyed."));
    }
    input.signal.throwIfAborted();
    if (this._pending) {
      return Promise.reject(new Error("Seed World authoritative generation Worker already has an active build."));
    }
    const worker = this._ensureWorker();
    const id = this._nextId++;
    const { heightTilePool, ownershipTilePool, signal, ...workerInput } = input;
    return new Promise<SeedWorldAuthoritativeGenerationBuildResultV1>((resolve, reject) => {
      const onAbort = () => this._abortPending(id);
      this._pending = {
        id,
        signal,
        heightTilePool,
        ownershipTilePool,
        resolve,
        reject,
        onAbort,
        workerInput,
        requestPublished: false
      };
      signal.addEventListener("abort", onAbort, { once: true });
      // Abort may have raced the listener registration between the entry check and this request publication.
      if (signal.aborted) {
        this._abortPending(id);
        return;
      }
      if (this._workerReady) this._publishPending(worker, this._pending);
    });
  }

  destroy(): void {
    if (this._destroyed) return;
    this._destroyed = true;
    const pending = this._takePending();
    this._terminateWorker();
    pending?.reject(new Error("Seed World authoritative generation Worker was terminated."));
  }

  private _ensureWorker(): Worker {
    if (this._worker) return this._worker;
    const worker = new SeedWorldAuthoritativeGenerationWorker();
    worker.addEventListener("message", (event: MessageEvent<SeedWorldAuthoritativeGenerationWorkerResponseV1>) =>
      this._handleMessage(worker, event.data)
    );
    worker.addEventListener("error", (event) => {
      this._handleWorkerFailure(
        worker,
        new Error(event.message || "Seed World authoritative generation Worker failed.")
      );
    });
    worker.addEventListener("messageerror", () => {
      this._handleWorkerFailure(worker, new Error("Seed World authoritative generation result could not be cloned."));
    });
    this._worker = worker;
    worker.postMessage({ kind: "initialize", heightBrushUrl: this._heightBrushUrl });
    return worker;
  }

  private _handleMessage(worker: Worker, response: SeedWorldAuthoritativeGenerationWorkerResponseV1): void {
    if (response.kind === "ready") {
      if (worker !== this._worker || this._workerReady) return;
      if (response.error) {
        const pending = this._takePending();
        this._terminateWorker();
        const error = new Error(response.error.message);
        error.name = response.error.name;
        pending?.reject(error);
        return;
      }
      this._workerReady = true;
      if (this._pending) this._publishPending(worker, this._pending);
      return;
    }
    const pending = this._pending;
    if (worker !== this._worker || !pending || response.id !== pending.id) return;
    if (response.error) {
      this._takePending();
      this._terminateWorker();
      const error = new Error(response.error.message);
      error.name = response.error.name;
      pending.reject(error);
      return;
    }
    if (!response.result) {
      this._takePending();
      this._terminateWorker();
      pending.reject(new Error("Seed World authoritative generation Worker returned no result."));
      return;
    }
    void this._hydrateResult(worker, response.result, pending);
  }

  private _publishPending(worker: Worker, pending: PendingAuthoritativeGenerationV1): void {
    if (worker !== this._worker || pending !== this._pending || pending.requestPublished) return;
    pending.requestPublished = true;
    try {
      worker.postMessage({ kind: "build", id: pending.id, input: pending.workerInput });
    } catch (error) {
      this._takePending();
      this._terminateWorker();
      pending.reject(error);
    }
  }

  private async _hydrateResult(
    worker: Worker,
    transferred: Readonly<SeedWorldTransferredAuthoritativeGenerationV1>,
    pending: PendingAuthoritativeGenerationV1
  ): Promise<void> {
    try {
      const result = await hydrateSeedWorldAuthoritativeGenerationV1(
        transferred,
        pending.heightTilePool,
        pending.ownershipTilePool,
        pending.signal
      );
      if (worker !== this._worker || this._pending !== pending) {
        result.release();
        return;
      }
      this._takePending()!.resolve(result);
    } catch (error) {
      if (this._pending !== pending) return;
      const current = this._takePending()!;
      this._terminateWorker();
      current.reject(error);
    }
  }

  private _handleWorkerFailure(worker: Worker, error: Error): void {
    if (worker !== this._worker) return;
    const pending = this._takePending();
    this._terminateWorker();
    pending?.reject(error);
  }

  private _abortPending(id: number): void {
    if (this._pending?.id !== id) return;
    const pending = this._takePending()!;
    // terminate() is the cancellation checkpoint for synchronous Worker code and drops its private cache/pools.
    this._terminateWorker();
    pending.reject(abortReason(pending.signal));
  }

  private _takePending(): PendingAuthoritativeGenerationV1 | undefined {
    const pending = this._pending;
    if (!pending) return undefined;
    this._pending = undefined;
    pending.signal.removeEventListener("abort", pending.onAbort);
    return pending;
  }

  private _terminateWorker(): void {
    this._worker?.terminate();
    this._worker = undefined;
    this._workerReady = false;
  }
}

function abortReason(signal: AbortSignal): unknown {
  return signal.reason ?? new DOMException("Seed World authoritative generation was canceled.", "AbortError");
}
