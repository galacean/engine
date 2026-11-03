import { constructionSupportMeshes } from "./ConstructionTerrainTransfer";
import type { MasonryDocument } from "./MasonryDocument";
import type { ConstructionUnitAssets } from "./ConstructionCompiler";
import type { CompiledMasonryLayout } from "./ConstructionLayout";
import type { ConstructionTerrainGrid, ConstructionGrounding } from "./ConstructionTerrain";
import type { ConstructionCpuPreparation, prepareConstructionCpu } from "./ConstructionCpu";
import { ConstructionLoadError } from "./ConstructionLoadError";

export type ConstructionDetail = CompiledMasonryLayout & { grounding?: ConstructionGrounding };
type Preview = Omit<ConstructionCpuPreparation, "prepared">;
type PreviewOptions = Parameters<typeof prepareConstructionCpu>[3];
// postMessage owns the copy. Do not first clone the entire height field on the render thread.
function terrainInput(
  document: MasonryDocument,
  terrain: ArrayBuffer | ConstructionTerrainGrid,
  includeSamples = true
) {
  return terrain instanceof ArrayBuffer
    ? includeSamples
      ? terrain
      : undefined
    : {
        ...terrain,
        samples: includeSamples ? terrain.samples : undefined,
        supports: constructionSupportMeshes(document, terrain)
      };
}
export interface ConstructionCpuHandle {
  /** Worker-local snapshots expire when that Worker fails; author data remains intact. */
  readonly valid: boolean;
  compile(signal: AbortSignal): Promise<ConstructionDetail>;
  dispose(): void;
}
/** One compiler per Scene owner. Intermediate algorithm objects stay in this Worker;
 * the render thread receives only detached arrays and an opaque lifetime handle.
 * Cancellation rejects the request immediately; late results cannot publish a view.
 */
export class ConstructionCpuClient {
  private worker?: Worker;
  private nextId = 0;
  private nextAssetId = 0;
  private assets = new WeakMap<ConstructionUnitAssets, { id: number; refs: number }>();
  private terrains = new WeakMap<object, { id: number; refs: number }>();
  private nextTerrainId = 0;
  private closed = false;
  private generation = 0;
  private pending = new Map<number, { resolve(value: any): void; reject(error: unknown): void; cleanup(): void }>();
  private send<T>(message: Record<string, unknown>, signal: AbortSignal): { id: number; result: Promise<T> } {
    signal.throwIfAborted();
    if (this.closed) throw Error("Building compiler disposed");
    if (!this.worker) {
      const worker = (this.worker = new Worker(new URL("./ConstructionWorker.ts", import.meta.url), {
        type: "module"
      }));
      worker.onmessage = ({ data }) => {
        if (this.worker !== worker) return;
        const request = this.pending.get(data.id);
        if (!request) return;
        this.pending.delete(data.id);
        request.cleanup();
        data.ok ? request.resolve(data.result) : request.reject(Error(data.error));
      };
      worker.onerror = (e) => {
        if (this.worker === worker)
          this.resetWorker(
            new ConstructionLoadError(`Construction Worker failed: ${e.message || "module script unavailable"}`, true)
          );
      };
      worker.onmessageerror = () => {
        if (this.worker === worker)
          this.resetWorker(new ConstructionLoadError("Construction Worker result could not be deserialized", true));
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
      try {
        this.worker!.postMessage({ ...message, id });
      } catch (error) {
        this.pending.delete(id);
        signal.removeEventListener("abort", abort);
        reject(error);
      }
    });
    return { id, result };
  }
  async prepare(
    document: MasonryDocument,
    terrain: ArrayBuffer | ConstructionTerrainGrid,
    units: ConstructionUnitAssets,
    signal: AbortSignal,
    previewOptions?: PreviewOptions
  ): Promise<Preview & { cpu: ConstructionCpuHandle }> {
    signal.throwIfAborted();
    const generation = this.generation;
    let asset = this.assets.get(units);
    if (!asset || !asset.refs) {
      asset = { id: ++this.nextAssetId, refs: 0 };
      this.assets.set(units, asset);
    }
    const first = asset.refs++ === 0;
    let ground = this.terrains.get(terrain);
    if (!ground || !ground.refs) {
      ground = { id: ++this.nextTerrainId, refs: 0 };
      this.terrains.set(terrain, ground);
    }
    const firstGround = ground.refs++ === 0;
    let id: number, result: Promise<Preview>;
    try {
      ({ id, result } = this.send<Preview>(
        {
          mode: "preview",
          document,
          terrain: terrainInput(document, terrain, firstGround),
          terrainId: ground.id,
          assetId: asset.id,
          ...(first ? { units } : {}),
          previewOptions
        },
        signal
      ));
    } catch (error) {
      asset.refs--;
      ground.refs--;
      throw error;
    }
    let disposed = false;
    const release = () => {
      if (!disposed) {
        disposed = true;
        asset!.refs--;
        ground!.refs--;
        if (generation === this.generation)
          this.worker?.postMessage({ mode: "release", token: id, assetId: asset!.id, terrainId: ground!.id });
      }
    };
    const valid = () => !disposed && !this.closed && generation === this.generation;
    try {
      const preview = await result;
      signal.throwIfAborted();
      if (!valid()) throw new ConstructionLoadError("Building compilation snapshot expired after Worker failure", true);
      return {
        ...preview,
        cpu: {
          get valid() {
            return valid();
          },
          compile: (signal) => {
            if (disposed) return Promise.reject(Error("Building compilation snapshot disposed"));
            if (!valid())
              return Promise.reject(
                new ConstructionLoadError("Building compilation snapshot expired after Worker failure", true)
              );
            return this.send<ConstructionDetail>({ mode: "detail", token: id }, signal).result;
          },
          dispose: release
        }
      };
    } catch (error) {
      release();
      throw error;
    }
  }
  validate(
    document: MasonryDocument,
    terrain: ConstructionTerrainGrid | undefined,
    units: ConstructionUnitAssets,
    signal: AbortSignal
  ): Promise<void> {
    return this.send<void>(
      { mode: "validate", document, terrain: terrain && terrainInput(document, terrain), units },
      signal
    ).result;
  }
  compile(
    document: MasonryDocument,
    terrain: ArrayBuffer | ConstructionTerrainGrid,
    units: ConstructionUnitAssets,
    signal: AbortSignal
  ) {
    return this.send<ConstructionDetail>(
      { mode: "detail", document, terrain: terrainInput(document, terrain), units },
      signal
    ).result;
  }
  dispose(reason: unknown = new DOMException("Building compiler disposed", "AbortError")) {
    this.closed = true;
    this.resetWorker(reason);
  }
  private resetWorker(reason: unknown): void {
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
/** Standalone consumers own a short-lived compiler. Scene views share their owner's compiler. */
export async function compileInWorker(
  document: MasonryDocument,
  terrain: ArrayBuffer | ConstructionTerrainGrid,
  units: ConstructionUnitAssets,
  signal: AbortSignal
): Promise<ConstructionDetail> {
  const client = new ConstructionCpuClient();
  try {
    return await client.compile(document, terrain, units, signal);
  } finally {
    client.dispose();
  }
}
export async function previewInWorker(
  document: MasonryDocument,
  terrain: ArrayBuffer | ConstructionTerrainGrid,
  units: ConstructionUnitAssets,
  signal: AbortSignal,
  options?: PreviewOptions
): Promise<Preview> {
  const client = new ConstructionCpuClient();
  try {
    const { cpu, ...preview } = await client.prepare(document, terrain, units, signal, options);
    return preview;
  } finally {
    client.dispose();
  }
}
