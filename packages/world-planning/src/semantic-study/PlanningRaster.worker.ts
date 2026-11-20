import { prepareSurfaceReliefMask, type SeedWorldSurfaceReliefMaskTuning } from "../runtime/SeedWorldSurfaceRelief";
import { PlanningRasterTransfer } from "./PlanningRasterTransfer";
const rasters = new PlanningRasterTransfer();
const nativeSnapshots = new Map<
  number,
  { plan: IslandPlan; data: { readonly plan: { readonly roadDistance: Uint16Array } } }
>();
import { compilePlanningSeedWorldData } from "../spatial/runtime/PlanningSeedWorldData";
import { adoptPlanningHeightmap, planningHeightmap, type PlanningHeightmap } from "./PlanningHeightmap";
import { planningAlphamap } from "./PlanningAlphamap";
import { compilePlanningOcean } from "./PlanningOceanSource";
import type { IslandPlan } from "./IslandPlanModel";

function collectArrayBuffers(value: unknown, target: Set<ArrayBuffer>, seen = new Set<object>()): void {
  if (!value || typeof value !== "object") return;
  if (ArrayBuffer.isView(value)) {
    if (value.buffer instanceof ArrayBuffer) target.add(value.buffer);
    return;
  }
  if (value instanceof ArrayBuffer) {
    target.add(value);
    return;
  }
  if (seen.has(value)) return;
  seen.add(value);
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) collectArrayBuffers(value[i], target, seen);
    return;
  }
  for (const entry of Object.values(value)) collectArrayBuffers(entry, target, seen);
}

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
  surfaceRelief?: SeedWorldSurfaceReliefMaskTuning;
  height?: Omit<PlanningHeightmap, "sample">;
}>) => {
  try {
    const start = performance.now();
    const supplied = data.heightFromBase ? rasters.get(data.baseId)?.height : data.height;
    if (data.heightFromBase && !supplied) throw new Error("Missing requested raster height baseline");
    const { sample, ...height } = supplied ? adoptPlanningHeightmap(data.plan, supplied) : planningHeightmap(data.plan);
    const alpha = planningAlphamap(data.plan);
    const ocean =
      data.ocean && data.plan.parameters.landMode !== "continuous" ? compilePlanningOcean(data.plan) : undefined;
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
      // Only roadDistance is ever reused across waterImpact revisions; keeping a minimal entry
      // lets every other nativeData typed-array buffer transfer zero-copy to the main thread.
      nativeSnapshots.set(data.id, { plan: data.plan, data: { plan: { roadDistance: nativeData.plan.roadDistance } } });
      for (const id of nativeSnapshots.keys()) if (id !== data.id && id !== data.baseId) nativeSnapshots.delete(id);
    }
    const surfaceRelief =
      nativeData && data.surfaceRelief
        ? prepareSurfaceReliefMask(nativeData.fields, nativeData.surfaceIntent, data.surfaceRelief)
        : undefined;
    const raster = rasters.encode(data.id, { height, alpha, ocean }, data.baseId);
    // Keep buffers retained by worker-side raster/roadDistance caches intact; zero-copy transfer
    // all remaining nativeData and surfaceRelief buffers to avoid multi-dozen-MiB clones on mobile.
    const retained = new Set<ArrayBuffer>();
    collectArrayBuffers({ height, alpha, ocean, raster }, retained);
    for (const snapshot of nativeSnapshots.values()) collectArrayBuffers(snapshot.data, retained);
    const candidateTransfers = new Set<ArrayBuffer>();
    collectArrayBuffers(nativeData, candidateTransfers);
    collectArrayBuffers(surfaceRelief, candidateTransfers);
    const transferables: ArrayBuffer[] = [];
    for (const buffer of candidateTransfers) {
      if (!retained.has(buffer)) transferables.push(buffer);
    }
    self.postMessage(
      {
        id: data.id,
        raster,
        nativeData,
        surfaceRelief,
        elapsedMs: performance.now() - start
      },
      transferables
    );
  } catch (error) {
    self.postMessage({ id: data.id, error: String(error) });
  }
};
