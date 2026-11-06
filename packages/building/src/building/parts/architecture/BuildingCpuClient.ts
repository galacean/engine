import type { BuildingDraft } from "./BuildingDraft";
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

/** Scene-owned Worker service. Handles own solved geometry; cancel/reset/release
 * never publish results. */
export class BuildingCpuClient {
  private worker?: Worker;
  private nextId = 0;
  private nextResourceId = 0;
  private generation = 0;
  private closed = false;
  private assets = new WeakMap<BuildingUnitAssets, Lease>();
  private terrains = new WeakMap<ConstructionTerrainGrid, Lease>();
  private pending = new Map<number, { resolve(value: any): void; reject(error: unknown): void; cleanup(): void }>();

  private send<T>(body: RequestBody, signal: AbortSignal) {
    signal.throwIfAborted();
    if (this.closed) throw Error("Building compiler disposed");
    if (!this.worker) {
      const worker = (this.worker = new Worker(new URL("./BuildingWorker.ts", import.meta.url), { type: "module" }));
      worker.onmessage = ({ data }: MessageEvent<BuildingWorkerReply>) => {
        if (this.worker !== worker) return;
        const request = this.pending.get(data.id);
        if (!request) return;
        this.pending.delete(data.id);
        request.cleanup();
        data.ok ? request.resolve(data.result) : request.reject(Error(data.error));
      };
      worker.onerror = (e) => {
        if (this.worker === worker)
          this.reset(new BuildingWorkerError(`Building Worker failed: ${e.message || "module script unavailable"}`));
      };
      worker.onmessageerror = () => {
        if (this.worker === worker)
          this.reset(new BuildingWorkerError("Building Worker result could not be deserialized"));
      };
    }
    const id = ++this.nextId;
    const result = new Promise<T>((resolve, reject) => {
      const abort = () => {
        this.pending.delete(id);
        signal.removeEventListener("abort", abort);
        reject(signal.reason ?? new DOMException("Cancelled", "AbortError"));
      };
      this.pending.set(id, { resolve, reject, cleanup: () => signal.removeEventListener("abort", abort) });
      signal.addEventListener("abort", abort, { once: true });
    });
    try {
      this.worker!.postMessage({ ...body, id } satisfies BuildingWorkerRequest);
    } catch (error) {
      // Roll back resource leases synchronously: a following prepare must not
      // reference assets/terrain that the Worker never received.
      this.pending.get(id)?.cleanup();
      this.pending.delete(id);
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
    const generation = this.generation;
    const acquire = <T extends object>(cache: WeakMap<T, Lease>, value: T) => {
      let lease = cache.get(value);
      if (!lease?.refs) {
        lease = { id: ++this.nextResourceId, refs: 0 };
        cache.set(value, lease);
      }
      const first = lease.refs++ === 0;
      return { lease, first };
    };
    const asset = acquire(this.assets, units),
      ground = acquire(this.terrains, terrain);
    let id: number, result: Promise<BuildingCpuPreview>;
    try {
      ({ id, result } = this.send<BuildingCpuPreview>(
        {
          mode: "preview",
          draft,
          options,
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
    const valid = () => !disposed && !this.closed && generation === this.generation;
    const release = () => {
      if (disposed) return;
      disposed = true;
      asset.lease.refs--;
      ground.lease.refs--;
      if (generation === this.generation)
        this.worker?.postMessage({ mode: "release", token: id } satisfies BuildingWorkerRequest);
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
            const result = await this.send<BuildingCpuDetail>({ mode: "detail", token: id }, signal).result;
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
    this.reset(reason);
  }
  private reset(reason: unknown) {
    const worker = this.worker;
    this.worker = undefined;
    this.generation++;
    if (worker) {
      worker.onmessage = worker.onerror = worker.onmessageerror = null;
      worker.terminate();
    }
    this.assets = new WeakMap();
    this.terrains = new WeakMap();
    for (const request of this.pending.values()) {
      request.cleanup();
      request.reject(reason);
    }
    this.pending.clear();
  }
}
