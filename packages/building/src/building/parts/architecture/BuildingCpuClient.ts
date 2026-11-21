import type { BuildingCoreDraft as BuildingDraft } from "../../core";
import type { BuildingCpuOptions } from "./BuildingCpu";
import type {
  BuildingWorkerRequest,
  BuildingWorkerReply,
  BuildingCpuPreview,
  BuildingCpuDetail
} from "./BuildingWorkerProtocol";
import type { ConstructionTerrainGrid } from "../../runtime/TerrainField";
import type { BuildingUnitAssets } from "../../runtime/BuildingUnitAssets";

export class BuildingWorkerError extends Error {
  readonly recoverable = true;
}
export interface BuildingCpuHandle {
  readonly valid: boolean;
  compile(signal: AbortSignal): Promise<BuildingCpuDetail>;
  dispose(): void;
}
type Lease = { id: number; refs: number };
type RequestBody = BuildingWorkerRequest extends infer R ? (R extends { id: number } ? Omit<R, "id"> : never) : never;

interface WorkerSlot {
  worker?: Worker;
  generation: number;
  inFlight: number;
  assets: WeakMap<BuildingUnitAssets, Lease>;
  terrains: WeakMap<ConstructionTerrainGrid, Lease>;
  pending: Map<number, { resolve(value: any): void; reject(error: unknown): void; cleanup(): void }>;
}

function defaultMaxBuildingWorkers(): number {
  const cores =
    typeof navigator !== "undefined" && Number.isFinite(navigator.hardwareConcurrency)
      ? navigator.hardwareConcurrency
      : 4;
  return Math.min(3, Math.max(1, cores - 1));
}

/** Scene-owned Worker service. Handles own solved geometry; cancel/reset/release
 * never publish results. Spawns additional workers lazily (up to maxWorkers) only
 * when multiple buildings compile concurrently so startup fans out across CPU cores. */
export class BuildingCpuClient {
  private readonly maxWorkers: number;
  private readonly slots: WorkerSlot[] = [];
  private nextId = 0;
  private nextResourceId = 0;
  private closed = false;

  constructor(maxWorkers = defaultMaxBuildingWorkers()) {
    this.maxWorkers = Math.max(1, Math.floor(maxWorkers));
  }

  private createSlot(): WorkerSlot {
    const slot: WorkerSlot = {
      generation: 0,
      inFlight: 0,
      assets: new WeakMap(),
      terrains: new WeakMap(),
      pending: new Map()
    };
    this.slots.push(slot);
    return slot;
  }

  private pickSlot(): WorkerSlot {
    let best: WorkerSlot | undefined;
    for (let i = 0; i < this.slots.length; i++) {
      const candidate = this.slots[i]!;
      if (candidate.inFlight === 0) return candidate;
      if (!best || candidate.inFlight < best.inFlight) best = candidate;
    }
    if (this.slots.length < this.maxWorkers) return this.createSlot();
    return best ?? this.createSlot();
  }

  private send<T>(slot: WorkerSlot, body: RequestBody, signal: AbortSignal) {
    signal.throwIfAborted();
    if (this.closed) throw Error("Building compiler disposed");
    if (!slot.worker) {
      const worker = (slot.worker = new Worker(new URL("./BuildingWorker.ts", import.meta.url), { type: "module" }));
      worker.onmessage = ({ data }: MessageEvent<BuildingWorkerReply>) => {
        if (slot.worker !== worker) return;
        const request = slot.pending.get(data.id);
        if (!request) return;
        slot.pending.delete(data.id);
        slot.inFlight = Math.max(0, slot.inFlight - 1);
        request.cleanup();
        if (data.ok === true) request.resolve(data.result);
        else request.reject(Error(data.error));
      };
      worker.onerror = (e) => {
        if (slot.worker === worker)
          this.resetSlot(
            slot,
            new BuildingWorkerError(`Building Worker failed: ${e.message || "module script unavailable"}`)
          );
      };
      worker.onmessageerror = () => {
        if (slot.worker === worker)
          this.resetSlot(slot, new BuildingWorkerError("Building Worker result could not be deserialized"));
      };
    }
    const id = ++this.nextId;
    slot.inFlight++;
    const result = new Promise<T>((resolve, reject) => {
      const abort = () => {
        if (slot.pending.delete(id)) {
          slot.inFlight = Math.max(0, slot.inFlight - 1);
        }
        signal.removeEventListener("abort", abort);
        reject(signal.reason ?? new DOMException("Cancelled", "AbortError"));
      };
      slot.pending.set(id, { resolve, reject, cleanup: () => signal.removeEventListener("abort", abort) });
      signal.addEventListener("abort", abort, { once: true });
    });
    try {
      slot.worker!.postMessage({ ...body, id } satisfies BuildingWorkerRequest);
    } catch (error) {
      // Roll back resource leases and in-flight count synchronously: a following prepare
      // must not reference assets/terrain that the Worker never received.
      slot.pending.get(id)?.cleanup();
      if (slot.pending.delete(id)) slot.inFlight = Math.max(0, slot.inFlight - 1);
      throw error;
    }

    return { id, result };
  }
  async prepare(
    draft: BuildingDraft,
    terrain: ConstructionTerrainGrid,
    units: BuildingUnitAssets,
    signal: AbortSignal,
    options?: BuildingCpuOptions
  ): Promise<BuildingCpuPreview & { cpu: BuildingCpuHandle }> {
    signal.throwIfAborted();
    if (this.closed) throw Error("Building compiler disposed");
    const slot = this.pickSlot();
    const generation = slot.generation;
    const acquire = <T extends object>(cache: WeakMap<T, Lease>, value: T) => {
      let lease = cache.get(value);
      if (!lease?.refs) {
        lease = { id: ++this.nextResourceId, refs: 0 };
        cache.set(value, lease);
      }
      const first = lease.refs++ === 0;
      return { lease, first };
    };
    const asset = acquire(slot.assets, units),
      ground = acquire(slot.terrains, terrain);
    let id: number, result: Promise<BuildingCpuPreview>;
    try {
      ({ id, result } = this.send<BuildingCpuPreview>(
        slot,
        {
          mode: "preview",
          draft,
          options,
          workerSlim: true,
          assetId: asset.lease.id,
          terrainId: ground.lease.id,
          ...(asset.first ? { units } : {}),
          ...(ground.first ? { terrain } : {})
        },
        signal
      ));
    } catch (error) {
      asset.lease.refs--;
      ground.lease.refs--;
      throw error;
    }
    let disposed = false;
    const valid = () => !disposed && !this.closed && generation === slot.generation;
    const release = () => {
      if (disposed) return;
      disposed = true;
      asset.lease.refs--;
      ground.lease.refs--;
      if (generation === slot.generation)
        slot.worker?.postMessage({ mode: "release", token: id } satisfies BuildingWorkerRequest);
    };
    try {
      const preview = await result;
      signal.throwIfAborted();
      if (!valid()) throw new BuildingWorkerError("Building compilation snapshot expired after Worker failure");
      return {
        ...preview,
        cpu: {
          get valid() {
            return valid();
          },
          compile: async (signal) => {
            if (disposed) throw Error("Building compilation snapshot disposed");
            if (!valid()) throw new BuildingWorkerError("Building compilation snapshot expired after Worker failure");
            const result = await this.send<BuildingCpuDetail>(
              slot,
              {
                mode: "detail",
                token: id,
                feedbackGrid: true,
                workerSlim: true
              },
              signal
            ).result;
            signal.throwIfAborted();
            if (!valid()) throw Error("Building compilation snapshot disposed or expired");
            return result;
          },
          dispose: release
        }
      };
    } catch (error) {
      release();
      throw error;
    }
  }
  dispose(reason: unknown = new DOMException("Building compiler disposed", "AbortError")) {
    if (this.closed) return;
    this.closed = true;
    for (const slot of this.slots) this.resetSlot(slot, reason);
  }
  private resetSlot(slot: WorkerSlot, reason: unknown) {
    const worker = slot.worker;
    slot.worker = undefined;
    slot.generation++;
    slot.inFlight = 0;
    if (worker) {
      worker.onmessage = worker.onerror = worker.onmessageerror = null;
      worker.terminate();
    }
    slot.assets = new WeakMap();
    slot.terrains = new WeakMap();
    for (const request of slot.pending.values()) {
      request.cleanup();
      request.reject(reason);
    }
    slot.pending.clear();
  }
}
