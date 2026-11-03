import type { SeedWorldFbmParameters } from "@galacean/engine-world-planning/runtime/SeedWorldFields";
import type { SeedWorldHydrologyBakeStyle } from "@galacean/engine-world-planning/runtime/SeedWorldHydrologyBake";
import type { SeedWorldPlan } from "@galacean/engine-world-planning/world/SeedWorldPlanner";
import type { SeedWorldTerrainGenerationSettings } from "@galacean/engine-terrain/world/SeedWorldTerrainGenerationSettings";
import {
  seedWorldAuthoritativePresentationSourceTransferablesV2,
  type SeedWorldAuthoritativePresentationSourceV2,
  type SeedWorldCompileResult,
  type SeedWorldLayoutFeaturePreview,
  type SeedWorldPresentationCompileResult
} from "./SeedWorldFieldWorkerProtocol.ts";
import grassColorFieldAssetUrl from "@galacean/engine-terrain/data/seed-world/public/textures/grass-color-detail.r8?url";
import SeedWorldFieldWorker from "./SeedWorldFieldWorker.ts?worker&inline";
import {
  SEED_WORLD_SURFACE_COLOR_FIELD_CHANNELS,
  SEED_WORLD_SURFACE_COLOR_FIELD_RESOLUTION
} from "@galacean/engine-terrain/world/SeedWorldSurfaceColorField";

const WORKER_REQUEST_TIMEOUT_MS = 180_000;
const GRASS_COLOR_FIELD_URL = new URL(grassColorFieldAssetUrl, import.meta.url).href;

type SeedWorldWorkerCompileResult = SeedWorldCompileResult | SeedWorldPresentationCompileResult;

interface PendingRequest {
  readonly resolve: (result: SeedWorldWorkerCompileResult) => void;
  readonly reject: (error: Error) => void;
  readonly onLayoutFeatures?: (preview: SeedWorldLayoutFeaturePreview) => void;
  readonly publish: (worker: Worker) => void;
  readonly timeoutId: ReturnType<typeof setTimeout>;
  published: boolean;
}

interface WorkerResponse {
  readonly id?: number;
  readonly ready?: boolean;
  readonly layoutFeatures?: SeedWorldLayoutFeaturePreview;
  readonly result?: SeedWorldWorkerCompileResult;
  readonly error?: string;
}

/** Runs full-resolution volatile terrain compilation away from the UI and render threads. */
export class SeedWorldFieldWorkerClient {
  private _worker: Worker;
  private readonly _pending = new Map<number, PendingRequest>();
  private _nextId = 1;
  private _destroyed = false;
  private _startupError: Error | undefined;
  private _workerReady = false;
  constructor() {
    this._worker = this._createWorker();
  }

  private _createWorker(): Worker {
    this._startupError = undefined;
    this._workerReady = false;
    const worker = new SeedWorldFieldWorker();
    worker.addEventListener("message", (event: MessageEvent<WorkerResponse>) => {
      if (worker !== this._worker) return;
      if (event.data.ready) {
        if (event.data.error) {
          const error = new Error(event.data.error);
          this._startupError = error;
          for (const pending of this._pending.values()) {
            clearTimeout(pending.timeoutId);
            pending.reject(error);
          }
          this._pending.clear();
          return;
        }
        if (this._workerReady) return;
        this._workerReady = true;
        for (const id of this._pending.keys()) this._publishPending(id);
        return;
      }
      if (event.data.id === undefined) return;
      const pending = this._pending.get(event.data.id);
      if (!pending) return;
      if (event.data.layoutFeatures) {
        pending.onLayoutFeatures?.(event.data.layoutFeatures);
        return;
      }
      this._pending.delete(event.data.id);
      clearTimeout(pending.timeoutId);
      if (event.data.error) {
        pending.reject(new Error(event.data.error));
      } else if (event.data.result) {
        try {
          pending.resolve(validateWorkerCompileResult(event.data.result));
        } catch (error) {
          pending.reject(error instanceof Error ? error : new Error(String(error)));
        }
      } else {
        pending.reject(new Error("Seed World worker returned no compile result"));
      }
    });
    worker.addEventListener("error", (event) => {
      if (worker !== this._worker) return;
      const error = new Error(event.message || "Seed World field worker failed");
      this._startupError = error;
      this._workerReady = false;
      for (const pending of this._pending.values()) {
        clearTimeout(pending.timeoutId);
        pending.reject(error);
      }
      this._pending.clear();
    });
    return worker;
  }

  private _setPending(id: number, pending: Omit<PendingRequest, "timeoutId" | "published">): void {
    const timeoutId = setTimeout(() => {
      if (!this._pending.delete(id)) return;
      pending.reject(new Error(`Seed World field worker timed out after ${WORKER_REQUEST_TIMEOUT_MS / 1_000} seconds`));
      this._worker.terminate();
      if (!this._destroyed) this._worker = this._createWorker();
    }, WORKER_REQUEST_TIMEOUT_MS);
    this._pending.set(id, { ...pending, timeoutId, published: false });
  }

  private _publishPending(id: number): void {
    if (!this._workerReady) return;
    const pending = this._pending.get(id);
    if (!pending || pending.published) return;
    pending.published = true;
    try {
      pending.publish(this._worker);
    } catch (error) {
      this._pending.delete(id);
      clearTimeout(pending.timeoutId);
      pending.reject(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Compiles one complete Root Seed plan with a debug-selected FBM profile.
   * @param plan Authoritative semantic world plan.
   * @param fbm Band-limited FBM parameters used by the height compiler.
   * @param terrainSettings Validated Heightmap, coverage, and Clipmap dimensions.
   * @param onLayoutFeatures Optional exact-feature callback fired before population compilation completes.
   * @param hydrologyStyle Optional depth and bank style that reuses the cached basin topology.
   * @param debugTimings Whether the Worker should publish structured phase timings to the console.
   * @returns Generated volatile fields, shared placements, population preview, and material intent.
   * @throws {Error} When the Worker has been destroyed or compilation fails.
   */
  generate(
    plan: SeedWorldPlan,
    fbm: SeedWorldFbmParameters,
    terrainSettings: SeedWorldTerrainGenerationSettings,
    onLayoutFeatures?: (preview: SeedWorldLayoutFeaturePreview) => void,
    hydrologyStyle?: SeedWorldHydrologyBakeStyle,
    debugTimings = false
  ): Promise<SeedWorldCompileResult> {
    if (this._destroyed) return Promise.reject(new Error("Seed World field worker has been destroyed"));
    if (this._startupError) return Promise.reject(this._startupError);
    const id = this._nextId++;
    return new Promise<SeedWorldCompileResult>((resolve, reject) => {
      this._setPending(id, {
        resolve: (result) => {
          if (!("hydrology" in result)) {
            reject(new Error("Seed World planned-layout worker returned an authoritative presentation result"));
            return;
          }
          resolve(result);
        },
        reject,
        onLayoutFeatures,
        publish: (worker) =>
          worker.postMessage({
            kind: "planned-hydrology-layout-v1",
            id,
            plan,
            fbm,
            terrainSettings,
            hydrologyStyle,
            grassColorFieldUrl: GRASS_COLOR_FIELD_URL,
            debugTimings
          })
      });
      this._publishPending(id);
    });
  }

  /**
   * Compiles production presentation data from sealed Hydrology/Hfinal views.
   * The Worker reuses the planned Basin Topology for presentation and never derives Basin support from SDF or render masks.
   * @param plan Authoritative world plan already resolved against Hydrology.
   * @param terrainSettings Validated Heightmap and coverage dimensions.
   * @param source Sealed Hydrology/Hfinal presentation source.
   * @param debugTimings Whether the Worker should publish structured phase timings to the console.
   * @returns Presentation fields and render-facing instance data.
   */
  generateAuthoritativePresentation(
    plan: SeedWorldPlan,
    terrainSettings: SeedWorldTerrainGenerationSettings,
    source: SeedWorldAuthoritativePresentationSourceV2,
    debugTimings = false
  ): Promise<SeedWorldPresentationCompileResult> {
    if (this._destroyed) return Promise.reject(new Error("Seed World field worker has been destroyed"));
    if (this._startupError) return Promise.reject(this._startupError);
    const id = this._nextId++;
    return new Promise<SeedWorldPresentationCompileResult>((resolve, reject) => {
      this._setPending(id, {
        resolve: (result) => {
          if ("hydrology" in result) {
            reject(new Error("Seed World authoritative presentation worker returned a layout Hydrology result"));
            return;
          }
          resolve(result);
        },
        reject,
        publish: (worker) =>
          worker.postMessage(
            {
              kind: "authoritative-presentation-v2",
              id,
              plan,
              terrainSettings,
              source,
              grassColorFieldUrl: GRASS_COLOR_FIELD_URL,
              debugTimings
            },
            seedWorldAuthoritativePresentationSourceTransferablesV2(source)
          )
      });
      this._publishPending(id);
    });
  }

  /**
   * Abandons obsolete compilation before a different authoring document is queued.
   * @param reason Error message delivered to callers awaiting the obsolete result.
   * @returns Whether an active compilation was canceled.
   */
  cancelPending(reason = "Seed World authoring document changed"): boolean {
    if (this._destroyed || this._pending.size === 0) return false;
    this._worker.terminate();
    for (const pending of this._pending.values()) {
      clearTimeout(pending.timeoutId);
      pending.reject(new Error(reason));
    }
    this._pending.clear();
    this._worker = this._createWorker();
    return true;
  }

  /**
   * Rejects pending work and releases the dedicated compiler worker.
   * @returns Nothing.
   */
  destroy(): void {
    if (this._destroyed) return;
    this._destroyed = true;
    this._worker.terminate();
    for (const pending of this._pending.values()) {
      clearTimeout(pending.timeoutId);
      pending.reject(new Error("Seed World field worker was terminated"));
    }
    this._pending.clear();
  }
}

function validateWorkerCompileResult(result: SeedWorldWorkerCompileResult): SeedWorldWorkerCompileResult {
  const expectedLength = SEED_WORLD_SURFACE_COLOR_FIELD_RESOLUTION ** 2 * SEED_WORLD_SURFACE_COLOR_FIELD_CHANNELS;
  if (!(result.surfaceColorSamples instanceof Uint8Array) || result.surfaceColorSamples.byteLength !== expectedLength) {
    throw new Error("Seed World worker returned invalid surface color samples");
  }
  return result;
}
