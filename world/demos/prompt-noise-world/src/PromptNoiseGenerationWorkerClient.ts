import type { PromptNoisePlacementWindow } from "./PromptNoisePlacement.ts";
import type { PromptNoiseWaterWindow } from "./PromptNoiseRuntimeGeneration.ts";
import type { PromptNoiseWorkerRequest, PromptNoiseWorkerResponse } from "./PromptNoiseWorkerProtocol.ts";
import type { PromptNoiseWorldPlanV1 } from "./PromptNoiseWorldContract.ts";
import type { WaterSemanticFieldSnapshotV1 } from "@galacean/engine-water/water/runtime/index";
import type { PromptNoiseWaterLayoutAuditV1, PromptNoiseWaterLayoutCandidateV1 } from "./PromptNoiseWaterLayout.ts";
import type { PromptNoiseSceneLayoutV1 } from "./PromptNoiseSceneLayout.ts";
import type { PromptNoiseWorldRecipe } from "@galacean/engine-world-planning/generation/noise/PromptNoiseTerrainProgram";

const PLACEMENT_CACHE_LIMIT = 12;
const WATER_CACHE_LIMIT = 8;
const SAMPLE_LIMIT = 128;

interface PendingRequest<T> {
  readonly resolve: (value: T) => void;
  readonly reject: (reason: Error) => void;
}

type WorkerRequestWithoutId<T> = T extends PromptNoiseWorkerRequest ? Omit<T, "requestId"> : never;

/** Worker and LRU diagnostics exposed by the single Gallery demo. */
export interface PromptNoiseWorkerMetrics {
  readonly generationP50Milliseconds: number;
  readonly generationP95Milliseconds: number;
  readonly activeBytes: number;
  readonly cacheBytes: number;
  readonly placementCacheEntries: number;
  readonly waterCacheEntries: number;
}

/** Owns Worker requests and bounded deterministic Chunk caches. */
export class PromptNoiseGenerationWorkerClient {
  private readonly _worker = new Worker(new URL("./PromptNoiseGenerationWorker.ts", import.meta.url), {
    type: "module",
    name: "prompt-noise-world-generation"
  });
  private readonly _pending = new Map<number, PendingRequest<PromptNoiseWorkerResponse>>();
  private readonly _placementCache = new Map<string, PromptNoisePlacementWindow>();
  private readonly _waterCache = new Map<string, PromptNoiseWaterWindow>();
  private readonly _generationSamples: number[] = [];
  private _nextRequestId = 1;
  private _activePlacementBytes = 0;
  private _activeWaterBytes = 0;
  private _destroyed = false;

  constructor() {
    this._worker.onmessage = (event: MessageEvent<PromptNoiseWorkerResponse>) => this._resolve(event.data);
    this._worker.onerror = (event) => {
      const error = new Error(event.message || "Prompt-noise generation Worker failed");
      for (const pending of this._pending.values()) pending.reject(error);
      this._pending.clear();
    };
  }

  /** @returns Percentiles and bounded active/cache byte counts. */
  get metrics(): PromptNoiseWorkerMetrics {
    const samples = [...this._generationSamples].sort((left, right) => left - right);
    return Object.freeze({
      generationP50Milliseconds: percentile(samples, 0.5),
      generationP95Milliseconds: percentile(samples, 0.95),
      activeBytes: this._activePlacementBytes + this._activeWaterBytes,
      cacheBytes:
        sumValues(this._placementCache, (window) => window.transientBytes) +
        sumValues(this._waterCache, (window) => window.sourceBytes),
      placementCacheEntries: this._placementCache.size,
      waterCacheEntries: this._waterCache.size
    });
  }

  /**
   * Generates or recalls an active decoration window.
   * @param plan Current immutable world plan.
   * @param centerChunk Logical center Chunk.
   * @param radius Active Chunk radius.
   * @returns Stable placement window.
   */
  async generatePlacement(
    plan: PromptNoiseWorldPlanV1,
    centerChunk: readonly [x: number, z: number],
    radius: number
  ): Promise<PromptNoisePlacementWindow> {
    const key = `${planKey(plan)}:${centerChunk[0]}:${centerChunk[1]}:${radius}`;
    const cached = touch(this._placementCache, key);
    if (cached) {
      this._activePlacementBytes = cached.transientBytes;
      return cached;
    }
    const response = await this._dispatch({ kind: "placement", plan, centerChunk, radius });
    if (response.kind !== "placement") throw new Error(`Unexpected Worker response: ${response.kind}`);
    this._recordSample(response.generationMilliseconds);
    insertLru(this._placementCache, key, response.window, PLACEMENT_CACHE_LIMIT);
    this._activePlacementBytes = response.window.transientBytes;
    return response.window;
  }

  /**
   * Generates or recalls active typed water samples.
   * @param plan Current immutable world plan.
   * @param logicalCamera Logical camera XZ in metres.
   * @returns Stable transferable water window.
   */
  async generateWater(
    plan: PromptNoiseWorldPlanV1,
    logicalCamera: readonly [x: number, z: number]
  ): Promise<PromptNoiseWaterWindow> {
    const logicalCellX = Math.floor(logicalCamera[0] / 128);
    const logicalCellZ = Math.floor(logicalCamera[1] / 128);
    const key = `${planKey(plan)}:${logicalCellX}:${logicalCellZ}`;
    const cached = touch(this._waterCache, key);
    if (cached) {
      this._activeWaterBytes = cached.sourceBytes;
      return cached;
    }
    const response = await this._dispatch({ kind: "water", plan, logicalCamera });
    if (response.kind !== "water") throw new Error(`Unexpected Worker response: ${response.kind}`);
    this._recordSample(response.generationMilliseconds);
    insertLru(this._waterCache, key, response.window, WATER_CACHE_LIMIT);
    this._activeWaterBytes = response.window.sourceBytes;
    return response.window;
  }

  async auditWaterLayout(
    semanticField: WaterSemanticFieldSnapshotV1,
    candidates: readonly PromptNoiseWaterLayoutCandidateV1[]
  ): Promise<PromptNoiseWaterLayoutAuditV1> {
    const response = await this._dispatch({ kind: "water-layout", semanticField, candidates });
    if (response.kind !== "water-layout") throw new Error(`Unexpected Worker response: ${response.kind}`);
    this._recordSample(response.generationMilliseconds);
    return response.audit;
  }

  /** Generates the actual C2-D scene layout from one committed Recipe/Semantic generation. */
  async generateSceneLayout(
    recipe: PromptNoiseWorldRecipe,
    semanticField: WaterSemanticFieldSnapshotV1
  ): Promise<PromptNoiseSceneLayoutV1> {
    const response = await this._dispatch({ kind: "scene-layout", recipe, semanticField });
    if (response.kind !== "scene-layout") throw new Error(`Unexpected Worker response: ${response.kind}`);
    this._recordSample(response.generationMilliseconds);
    this._activePlacementBytes = response.layout.transientBytes;
    return response.layout;
  }

  /** Terminates the Worker and rejects unresolved requests. */
  destroy(): void {
    if (this._destroyed) return;
    this._destroyed = true;
    this._worker.terminate();
    const error = new Error("Prompt-noise generation Worker was destroyed");
    for (const pending of this._pending.values()) pending.reject(error);
    this._pending.clear();
    this._placementCache.clear();
    this._waterCache.clear();
    this._generationSamples.length = 0;
    this._activePlacementBytes = 0;
    this._activeWaterBytes = 0;
  }

  private _dispatch(request: WorkerRequestWithoutId<PromptNoiseWorkerRequest>): Promise<PromptNoiseWorkerResponse> {
    if (this._destroyed) return Promise.reject(new Error("Prompt-noise generation Worker was destroyed"));
    const requestId = this._nextRequestId++;
    return new Promise((resolve, reject) => {
      this._pending.set(requestId, { resolve, reject });
      this._worker.postMessage({ ...request, requestId });
    });
  }

  private _resolve(response: PromptNoiseWorkerResponse): void {
    const pending = this._pending.get(response.requestId);
    if (!pending) return;
    this._pending.delete(response.requestId);
    if (response.kind === "error") pending.reject(new Error(response.message));
    else pending.resolve(response);
  }

  private _recordSample(milliseconds: number): void {
    this._generationSamples.push(milliseconds);
    if (this._generationSamples.length > SAMPLE_LIMIT) this._generationSamples.shift();
  }
}

function planKey(plan: PromptNoiseWorldPlanV1): string {
  let hash = 0x811c9dc5;
  for (const character of JSON.stringify(plan)) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

function touch<T>(cache: Map<string, T>, key: string): T | undefined {
  const value = cache.get(key);
  if (value === undefined) return undefined;
  cache.delete(key);
  cache.set(key, value);
  return value;
}

function insertLru<T>(cache: Map<string, T>, key: string, value: T, limit: number): void {
  cache.set(key, value);
  while (cache.size > limit) cache.delete(cache.keys().next().value!);
}

function sumValues<T>(cache: Map<string, T>, size: (value: T) => number): number {
  let total = 0;
  for (const value of cache.values()) total += size(value);
  return total;
}

function percentile(sorted: readonly number[], ratio: number): number {
  if (sorted.length === 0) return 0;
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * ratio) - 1)];
}
