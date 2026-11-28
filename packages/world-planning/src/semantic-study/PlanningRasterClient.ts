import type { PreparedSurfaceReliefMask, SeedWorldSurfaceReliefMaskTuning } from "../runtime/SeedWorldSurfaceRelief";
import { PlanningRasterTransfer, type PlanningRasterPacket } from "./PlanningRasterTransfer";
import type { CompiledPlanningSeedWorldData } from "../spatial/runtime/PlanningSeedWorldData";
import type { IslandPlan } from "./IslandPlanModel";
import { adoptPlanningHeightmap, cachedPlanningHeightmap } from "./PlanningHeightmap";
import { adoptPlanningAlphamap } from "./PlanningAlphamap";
import { adoptPlanningOcean } from "./PlanningOceanSource";
export interface PlanningRasterHeightSnapshot {
  readonly resolution: number;
  readonly encoded: Uint16Array;
  readonly decodeOffset: number;
  readonly decodeScale: number;
}
interface RasterHeightReadyMessage {
  id: number;
  kind: "height-ready";
  height: PlanningRasterHeightSnapshot;
}
interface RasterResult {
  id: number;
  kind?: "result";
  raster: PlanningRasterPacket;
  nativeData?: CompiledPlanningSeedWorldData;
  surfaceRelief?: PreparedSurfaceReliefMask;
  elapsedMs: number;
  error?: string;
}
type RasterWorkerMessage = RasterHeightReadyMessage | RasterResult;
/** One coalesced raster job at a time; obsolete results never enter renderer caches. */
export class PlanningRasterClient {
  private worker?: Worker;
  private rasters = new PlanningRasterTransfer();
  private baseId?: number;
  private sequence = 0;
  private nativeData = new WeakMap<IslandPlan, CompiledPlanningSeedWorldData>();
  private earlyHeights = new WeakMap<IslandPlan, PlanningRasterHeightSnapshot>();
  private heightWaiters = new Map<IslandPlan, ((height: PlanningRasterHeightSnapshot | undefined) => void)[]>();
  /** Consume detached native data only after the matching request has completed. */
  takeNativeData(plan: IslandPlan) {
    const value = this.nativeData.get(plan);
    this.nativeData.delete(plan);
    return value;
  }
  /** Wait for the encoded R16 height grid of an active or cached plan without waiting for alphamap/nativeData. */
  waitForHeight(plan: IslandPlan): Promise<PlanningRasterHeightSnapshot | undefined> {
    const cached = cachedPlanningHeightmap(plan);
    if (cached) {
      return Promise.resolve({
        resolution: cached.resolution,
        encoded: cached.encoded,
        decodeOffset: cached.decodeOffset,
        decodeScale: cached.decodeScale
      });
    }
    const early = this.earlyHeights.get(plan);
    if (early) return Promise.resolve(early);
    if (this.active?.plan !== plan) return Promise.resolve(undefined);
    return new Promise((resolve) => {
      const list = this.heightWaiters.get(plan);
      if (list) list.push(resolve);
      else this.heightWaiters.set(plan, [resolve]);
    });
  }
  private resolveHeightWaiters(plan: IslandPlan, height: PlanningRasterHeightSnapshot | undefined): void {
    const waiters = this.heightWaiters.get(plan);
    if (!waiters) return;
    this.heightWaiters.delete(plan);
    for (const resolve of waiters) resolve(height);
  }
  private clearAllHeightWaiters(): void {
    for (const waiters of this.heightWaiters.values()) {
      for (const resolve of waiters) resolve(undefined);
    }
    this.heightWaiters.clear();
  }
  private surfaceRelief = new WeakMap<IslandPlan, PreparedSurfaceReliefMask>();
  takeSurfaceRelief(plan: IslandPlan) {
    const value = this.surfaceRelief.get(plan);
    this.surfaceRelief.delete(plan);
    return value;
  }
  private inFlight = false;
  private idleReleaseTimer?: ReturnType<typeof setTimeout>;
  private scheduleIdleRelease(): void {
    if (this.idleReleaseTimer !== undefined) clearTimeout(this.idleReleaseTimer);
    this.idleReleaseTimer = setTimeout(() => {
      this.idleReleaseTimer = undefined;
      if (!this.inFlight && !this.queued && !this.active && this.worker) {
        this.worker.terminate();
        this.worker = undefined;
        this.rasters.clear();
        this.baseId = undefined;
      }
    }, 400);
  }
  private queued?: {
    id: number;
    plan: IslandPlan;
    ocean: boolean;
    nativeData: boolean;
    waterImpact: boolean;
    surfaceRelief?: SeedWorldSurfaceReliefMaskTuning;
  };
  private active?: {
    id: number;
    plan: IslandPlan;
    resolve: (elapsed: number | undefined) => void;
    reject: (error: Error) => void;
  };
  /** Prepare one plan for rendering; superseded calls resolve without publishing. */
  run(
    plan: IslandPlan,
    ocean = false,
    nativeData = false,
    waterImpact = false,
    surfaceRelief?: SeedWorldSurfaceReliefMaskTuning
  ): Promise<number | undefined> {
    if (this.idleReleaseTimer !== undefined) {
      clearTimeout(this.idleReleaseTimer);
      this.idleReleaseTimer = undefined;
    }
    if (this.active) {
      const superseded = this.active;
      this.active = undefined;
      this.resolveHeightWaiters(superseded.plan, undefined);
      superseded.resolve(undefined);
    }
    this.nativeData.delete(plan);
    this.surfaceRelief.delete(plan);
    this.earlyHeights.delete(plan);
    const id = ++this.sequence;
    return new Promise((resolve, reject) => {
      this.active = { id, plan, resolve, reject };
      this.queued = { id, plan, ocean, nativeData, waterImpact, surfaceRelief };
      this.dispatch();
    });
  }
  /** Pre-spawn the idle raster worker so module fetch/parse overlaps with planning worker computation. */
  prewarm(): void {
    if (this.worker) return;
    try {
      this.ensureWorker();
    } catch {
      // Best-effort prewarm; run() surfaces any real worker startup error.
    }
  }
  private ensureWorker(): Worker {
    if (this.worker) return this.worker;
    const worker = new Worker(new URL("./PlanningRaster.worker.ts", import.meta.url), { type: "module" });
    worker.onmessage = ({ data }: MessageEvent<RasterWorkerMessage>) => {
      if (data.kind === "height-ready") {
        if (data.id === this.active?.id) {
          this.earlyHeights.set(this.active.plan, data.height);
          this.resolveHeightWaiters(this.active.plan, data.height);
        }
        return;
      }
      this.inFlight = false;
      if (data.id === this.active?.id) {
        const active = this.active;
        this.active = undefined;
        if (data.error) {
          this.resolveHeightWaiters(active.plan, undefined);
          active.reject(new Error(data.error));
        } else {
          try {
            const raster = this.rasters.decode(data.id, data.raster);
            adoptPlanningHeightmap(active.plan, raster.height);
            adoptPlanningAlphamap(active.plan, raster.alpha);
            if (raster.ocean) adoptPlanningOcean(active.plan, raster.ocean);
            if (data.nativeData) this.nativeData.set(active.plan, data.nativeData);
            if (data.surfaceRelief) this.surfaceRelief.set(active.plan, data.surfaceRelief);
            this.baseId = data.id;
            const heightSnapshot: PlanningRasterHeightSnapshot = {
              resolution: raster.height.resolution,
              encoded: raster.height.encoded,
              decodeOffset: raster.height.decodeOffset,
              decodeScale: raster.height.decodeScale
            };
            this.earlyHeights.set(active.plan, heightSnapshot);
            this.resolveHeightWaiters(active.plan, heightSnapshot);
            active.resolve(data.elapsedMs);
          } catch (error) {
            this.resolveHeightWaiters(active.plan, undefined);
            active.reject(error instanceof Error ? error : new Error(String(error)));
          }
        }
      }
      this.dispatch();
      if (!this.inFlight && !this.queued && !this.active) this.scheduleIdleRelease();
    };
    worker.onerror = (e) => this.fail(new Error(e.message || "地表编译线程失败"));
    this.worker = worker;
    return worker;
  }
  private dispatch(): void {
    if (this.inFlight || !this.queued) return;
    try {
      const worker = this.ensureWorker();
      this.inFlight = true;
      const request = this.queued;
      this.queued = undefined;
      const compiledHeight = cachedPlanningHeightmap(request.plan);
      const base = this.rasters.get(this.baseId)?.height;
      const heightFromBase =
        !!compiledHeight &&
        !!base &&
        compiledHeight.heights === base.heights &&
        compiledHeight.encoded === base.encoded;
      const height = compiledHeight && !heightFromBase ? (({ sample, ...data }) => data)(compiledHeight) : undefined;
      // Clone rather than transfer: CPU picking, navigation and subsequent edits retain
      // their canonical height buffers while the raster worker compiles other surfaces.
      worker.postMessage({ ...request, baseId: this.baseId, height, heightFromBase });
    } catch (error) {
      this.fail(new Error(String(error)));
    }
  }
  private fail(error: Error): void {
    this.worker?.terminate();
    this.worker = undefined;
    this.rasters.clear();
    this.baseId = undefined;
    this.inFlight = false;
    this.queued = undefined;
    this.clearAllHeightWaiters();
    this.active?.reject(error);
    this.active = undefined;
  }
  /** Release pending work and settle observers during view destruction. */
  dispose(): void {
    if (this.idleReleaseTimer !== undefined) {
      clearTimeout(this.idleReleaseTimer);
      this.idleReleaseTimer = undefined;
    }
    this.nativeData = new WeakMap();
    this.surfaceRelief = new WeakMap();
    this.earlyHeights = new WeakMap();
    this.clearAllHeightWaiters();
    this.active?.resolve(undefined);
    this.active = undefined;
    this.queued = undefined;
    this.worker?.terminate();
    this.worker = undefined;
    this.rasters.clear();
    this.baseId = undefined;
    this.inFlight = false;
  }
}
