import profile from "../planning-data/settlement-profile.json";
import { captureWaterTerrainSnapshot } from "@galacean/engine-water/water/authoring/terrain/index";
import { captureLakeTerrain, resolveLakeTerrainBoundary } from "@galacean/engine-water/water/compiler/index";
import { createPlanningGroundSampler, createPlanningRingQuery } from "./WorldPlanningTerrain";
import { authoredLakeOutline, authoredLakeProfile, type AuthoredLakeShape } from "../spatial/hydrology/AuthoredLakes";
import type { IslandPlan, PlanPoint } from "./IslandPlanModel";
import type { SeedWorldWaterBodyResourceProperties } from "../agent-adapter/ports/SeedWorldEnginePort";
import type { LakeBoundaryV1 } from "@galacean/engine-water/water/index";

/** Grid-aligned capture of a basin outline; identical to the domain resolved for shoreline compilation. */
export function planningLakeCaptureExtent(
  origin: readonly [number, number],
  spacing: number,
  spacingZ: number,
  columns: number,
  rows: number,
  outline: readonly PlanPoint[]
): readonly [number, number, number, number] {
  const x0 = Math.max(0, Math.floor((Math.min(...outline.map((point) => point.x)) - origin[0]) / spacing));
  const z0 = Math.max(0, Math.floor((Math.min(...outline.map((point) => point.z)) - origin[1]) / spacingZ));
  const x1 = Math.min(columns - 1, Math.ceil((Math.max(...outline.map((point) => point.x)) - origin[0]) / spacing));
  const z1 = Math.min(rows - 1, Math.ceil((Math.max(...outline.map((point) => point.z)) - origin[1]) / spacingZ));
  return [origin[0] + x0 * spacing, origin[1] + z0 * spacingZ, origin[0] + x1 * spacing, origin[1] + z1 * spacingZ];
}

export interface AuthoredLakeBasin {
  outline: PlanPoint[];
  grid: {
    id: string;
    revision: number;
    origin: readonly [number, number];
    spacing: number;
    spacingZ: number;
    columns: number;
    rows: number;
    surface: "float32-triangles";
  };
  heights: readonly number[];
}

/** Canonical terrain over the basin support, with the basin's own carve removed so it can be re-derived. */
export function captureAuthoredLakeBasin(
  plan: IslandPlan,
  resourceId: string,
  value: AuthoredLakeShape
): AuthoredLakeBasin {
  const resolution = profile.world.heightmapResolution;
  const spacingX = plan.parameters.width / (resolution - 1),
    spacingZ = plan.parameters.depth / (resolution - 1);
  const outline = authoredLakeOutline(value);
  const extent = planningLakeCaptureExtent([0, 0], spacingX, spacingZ, resolution, resolution, outline);
  // Keep the edited basin's current carve out of its own new level; other carved basins stay in.
  const sampler = createPlanningGroundSampler(plan, { excludeWaterBodyId: resourceId });
  sampler.prepareBounds?.(extent);
  const sample = (point: PlanPoint) => Math.fround(sampler(point));
  const grid = {
    id: "planning-lake-basin",
    revision: 0,
    origin: [extent[0], extent[1]] as const,
    spacing: spacingX,
    spacingZ,
    columns: Math.round((extent[2] - extent[0]) / spacingX) + 1,
    rows: Math.round((extent[3] - extent[1]) / spacingZ) + 1,
    surface: "float32-triangles" as const
  };
  const snapshot = captureWaterTerrainSnapshot(grid, (x, z) => sample({ x, z }));
  return { outline, grid, heights: snapshot.heights };
}

/** Spill point: the lowest canonical bed over the shoreline capture. Every capture cell then holds
 * water only where the basin is carved, so the published isoline is a closed ring around the footprint.
 */
export function planningLakeSpillLevel(
  plan: IslandPlan,
  resourceId: string,
  value: AuthoredLakeShape,
  basin = captureAuthoredLakeBasin(plan, resourceId, value)
): number {
  return basin.heights.reduce((minimum, height) => Math.min(minimum, height), Infinity);
}

/** Resolve the shoreline with the same capture, carve and criterion used when the lake is published.
 * The bed is carved from the canonical datum while the isoline uses the current fill level.
 */
export function resolvePlanningLakeBoundary(
  plan: IslandPlan,
  resourceId: string,
  value: SeedWorldWaterBodyResourceProperties,
  basin = captureAuthoredLakeBasin(plan, resourceId, value)
): LakeBoundaryV1 {
  const carved = carveAuthoredLakeBasin(basin, value);
  const captured = captureLakeTerrain(carved),
    ring = createPlanningRingQuery(basin.outline);
  return resolveLakeTerrainBoundary(captured, value.waterLevelMetres, (x, z) => ring.inside({ x, z }));
}

/** Candidate bed shares the final Float32 vertex contract with PlanningHeightmap. */
export function carveAuthoredLakeBasin(basin: AuthoredLakeBasin, value: SeedWorldWaterBodyResourceProperties) {
  const profileAt = authoredLakeProfile(value);
  return captureWaterTerrainSnapshot(basin.grid, (x, z) => {
    const point = { x, z },
      profileValue = profileAt(point);
    const column = Math.round((x - basin.grid.origin[0]) / basin.grid.spacing);
    const row = Math.round((z - basin.grid.origin[1]) / basin.grid.spacingZ);
    const bed = basin.heights[row * basin.grid.columns + column];
    // Final Float32 rounding matches the canonical publish-time triangle vertices.
    return Math.fround(
      profileValue > 0 ? Math.min(bed, value.canonicalWaterLevelMetres - value.depthMetres * profileValue) : bed
    );
  });
}
