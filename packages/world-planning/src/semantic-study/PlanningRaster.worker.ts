import { PlanningRasterTransfer } from "./PlanningRasterTransfer";
const rasters = new PlanningRasterTransfer();
const nativeSnapshots = new Map<number, { plan: IslandPlan; data: ReturnType<typeof compilePlanningSeedWorldData> }>();
import { compilePlanningSeedWorldData } from "../spatial/runtime/PlanningSeedWorldData";
import { adoptPlanningHeightmap, planningHeightmap, type PlanningHeightmap } from "./PlanningHeightmap";
import { planningAlphamap } from "./PlanningAlphamap";
import { compilePlanningOcean } from "./PlanningOceanSource";
import type { IslandPlan } from "./IslandPlanModel";
/** Reuses the same pure raster compilers as tests and CPU queries. No renderer or editor state. */
self.onmessage = ({
  data
}: MessageEvent<{
  id: number;
  baseId?: number;
  heightFromBase?: boolean;
  plan: IslandPlan;
  ocean?: boolean;
  nativeData?: boolean;
  waterImpact?: boolean;
  height?: Omit<PlanningHeightmap, "sample">;
}>) => {
  try {
    const start = performance.now();
    const supplied = data.heightFromBase ? rasters.get(data.baseId)?.height : data.height;
    if (data.heightFromBase && !supplied) throw new Error("Missing requested raster height baseline");
    const { sample, ...height } = supplied ? adoptPlanningHeightmap(data.plan, supplied) : planningHeightmap(data.plan);
    const alpha = planningAlphamap(data.plan);
    const ocean = data.ocean ? compilePlanningOcean(data.plan) : undefined;
    const previous = data.baseId === undefined ? undefined : nativeSnapshots.get(data.baseId);
    const reuse =
      data.waterImpact &&
      previous &&
      previous.plan.parameters.seed === data.plan.parameters.seed &&
      previous.plan.parameters.width === data.plan.parameters.width &&
      previous.plan.parameters.depth === data.plan.parameters.depth &&
      JSON.stringify([previous.plan.routes, previous.plan.rocks, previous.plan.buildings]) ===
        JSON.stringify([data.plan.routes, data.plan.rocks, data.plan.buildings])
        ? previous.data
        : undefined;
    const nativeData = data.nativeData
      ? compilePlanningSeedWorldData(data.plan, { height: planningHeightmap(data.plan), alpha }, reuse)
      : undefined;
    if (nativeData) {
      nativeSnapshots.set(data.id, { plan: data.plan, data: nativeData });
      for (const id of nativeSnapshots.keys()) if (id !== data.id && id !== data.baseId) nativeSnapshots.delete(id);
    }
    // Structured clone preserves worker cache ownership for later incremental reuse.
    self.postMessage({
      id: data.id,
      raster: rasters.encode(data.id, { height, alpha, ocean }, data.baseId),
      nativeData,
      elapsedMs: performance.now() - start
    });
  } catch (error) {
    self.postMessage({ id: data.id, error: String(error) });
  }
};
