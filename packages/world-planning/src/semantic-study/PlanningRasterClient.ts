import { PlanningRasterTransfer, type PlanningRasterPacket } from "./PlanningRasterTransfer";
import type { PlanningSeedWorldData } from "../spatial/runtime/PlanningSeedWorldData";
import type { IslandPlan } from "./IslandPlanModel";
import { adoptPlanningHeightmap, cachedPlanningHeightmap } from "./PlanningHeightmap";
import { adoptPlanningAlphamap } from "./PlanningAlphamap";
import { adoptPlanningOcean } from "./PlanningOceanSource";
interface RasterResult {
  id: number;
  raster: PlanningRasterPacket;
  nativeData?: PlanningSeedWorldData;
  elapsedMs: number;
  error?: string;
}
/** One coalesced raster job at a time; obsolete results never enter renderer caches. */
export class PlanningRasterClient {
  private worker?: Worker;
  private rasters = new PlanningRasterTransfer();
  private baseId?: number;
  private sequence = 0;
  private nativeData = new WeakMap<IslandPlan, PlanningSeedWorldData>();
  /** Consume detached native data only after the matching request has completed. */
  takeNativeData(plan: IslandPlan) {
    const value = this.nativeData.get(plan);
    this.nativeData.delete(plan);
    return value;
  }
  private inFlight = false;
  private queued?: { id: number; plan: IslandPlan; ocean: boolean; nativeData: boolean; waterImpact: boolean };
  private active?: {
    id: number;
    plan: IslandPlan;
    resolve: (elapsed: number | undefined) => void;
    reject: (error: Error) => void;
  };
  /** Prepare one plan for rendering; superseded calls resolve without publishing. */
  run(plan: IslandPlan, ocean = false, nativeData = false, waterImpact = false): Promise<number | undefined> {
    this.active?.resolve(undefined);
    this.nativeData.delete(plan);
    const id = ++this.sequence;
    return new Promise((resolve, reject) => {
      this.active = { id, plan, resolve, reject };
      this.queued = { id, plan, ocean, nativeData, waterImpact };
      this.dispatch();
    });
  }
  private dispatch(): void {
    if (this.inFlight || !this.queued) return;
    try {
      if (!this.worker) {
        this.worker = new Worker(new URL("./PlanningRaster.worker.ts", import.meta.url), { type: "module" });
        this.worker.onmessage = ({ data }: MessageEvent<RasterResult>) => {
          this.inFlight = false;
          if (data.id === this.active?.id) {
            const active = this.active;
            this.active = undefined;
            if (data.error) active.reject(new Error(data.error));
            else {
              try {
                const raster = this.rasters.decode(data.id, data.raster);
                adoptPlanningHeightmap(active.plan, raster.height);
                adoptPlanningAlphamap(active.plan, raster.alpha);
                if (raster.ocean) adoptPlanningOcean(active.plan, raster.ocean);
                if (data.nativeData) this.nativeData.set(active.plan, data.nativeData);
                this.baseId = data.id;
                active.resolve(data.elapsedMs);
              } catch (error) {
                active.reject(error instanceof Error ? error : new Error(String(error)));
              }
            }
          }
          this.dispatch();
        };
        this.worker.onerror = (e) => this.fail(new Error(e.message || "地表编译线程失败"));
      }
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
      this.worker.postMessage({ ...request, baseId: this.baseId, height, heightFromBase });
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
    this.active?.reject(error);
    this.active = undefined;
  }
  /** Release pending work and settle observers during view destruction. */
  dispose(): void {
    this.nativeData = new WeakMap();
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
