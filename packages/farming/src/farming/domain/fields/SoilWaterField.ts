import type { FarmingSimulationConfig } from "../../config/FarmingSimulationConfig";
import type { FarmSnapshot } from "../FarmState";
import {
  boundsIntersect,
  plotBounds,
  type FarmingGroundChange,
  type FarmingGroundView,
  type PlotGroundState
} from "../FarmingGround";
import type { FarmChange } from "../FarmCommands";
import type { FieldGraph, FieldEdge } from "./SpatialField";

/** E, W, +Z, -Z; masks retain last confirmed transport facts for conservative offline replay. */
export const WATER_DIRECTIONS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1]
] as const;
const opposite = [1, 0, 3, 2];
const key = (groundId: string, x: number, z: number) => `${groundId}:${x}:${z}`;

export function refreshWaterGround(
  snapshot: FarmSnapshot,
  view: FarmingGroundView,
  time: number,
  force = false,
  change?: FarmingGroundChange
): { snapshot: FarmSnapshot; changes: FarmChange[] } {
  const byCell = new Map(snapshot.plots.map((p) => [key(p.groundId, p.cellX, p.cellZ), p]));
  if (
    !force &&
    snapshot.plots.every(
      (p) =>
        p.ground.waterCheckedRevision === view.revision &&
        p.ground.waterMask !== undefined &&
        WATER_DIRECTIONS.every(
          ([dx, dz], d) => !(p.ground.waterMask! & (1 << d)) || byCell.has(key(p.groundId, p.cellX + dx, p.cellZ + dz))
        )
    )
  )
    return { snapshot, changes: [] };
  const masks = new Map(snapshot.plots.map((p) => [p.plotId, 0]));
  for (const p of snapshot.plots)
    for (const d of [0, 2]) {
      const [dx, dz] = WATER_DIRECTIONS[d],
        n = byCell.get(key(p.groundId, p.cellX + dx, p.cellZ + dz));
      if (!n) continue;
      // Water connectivity and cultivation inspect the same complete cell footprints.
      const a = plotBounds(snapshot.grid, p),
        b = plotBounds(snapshot.grid, n);
      const bounds = {
        minimumX: Math.min(a.minimumX, b.minimumX),
        maximumX: Math.max(a.maximumX, b.maximumX),
        minimumZ: Math.min(a.minimumZ, b.minimumZ),
        maximumZ: Math.max(a.maximumZ, b.maximumZ)
      };
      if (
        change &&
        ((change.groundId && change.groundId !== p.groundId) ||
          (change.bounds && !boundsIntersect(bounds, change.bounds)))
      ) {
        if ((p.ground.waterMask ?? 0) & (1 << d)) {
          masks.set(p.plotId, masks.get(p.plotId)! | (1 << d));
          masks.set(n.plotId, masks.get(n.plotId)! | (1 << opposite[d]));
        }
        continue;
      }
      const inspection = view.inspectBounds(p.groundId, bounds);
      if (
        !inspection.covered ||
        inspection.blocked ||
        inspection.underwater ||
        !inspection.surfaces.length ||
        inspection.surfaces.some((s) => s !== "soil" && s !== "grass")
      )
        continue;
      masks.set(p.plotId, masks.get(p.plotId)! | (1 << d));
      masks.set(n.plotId, masks.get(n.plotId)! | (1 << opposite[d]));
    }
  const changes: FarmChange[] = [];
  const plots = snapshot.plots.map((p) => {
    const mask = masks.get(p.plotId)!;
    const since = WATER_DIRECTIONS.map((_, d) =>
      mask & (1 << d) ? ((p.ground.waterMask ?? 0) & (1 << d) ? (p.ground.waterSinceMs?.[d] ?? time) : time) : 0
    );
    const ground = { ...p.ground, waterMask: mask, waterSinceMs: since, waterCheckedRevision: view.revision };
    if (
      p.ground.waterMask === mask &&
      p.ground.waterCheckedRevision === view.revision &&
      since.every((v, d) => v === p.ground.waterSinceMs?.[d])
    )
      return p;
    changes.push({ kind: "plot-ground-changed", plotId: p.plotId, ground });
    return { ...p, ground };
  });
  return { snapshot: changes.length ? { ...snapshot, plots } : snapshot, changes };
}

export function buildWaterGraph(
  snapshot: FarmSnapshot,
  config: FarmingSimulationConfig
): FieldGraph & { readonly plotIndices: readonly number[] } {
  const plotIndices = snapshot.plots
    .map((_, i) => i)
    .sort((a, b) => (snapshot.plots[a].plotId < snapshot.plots[b].plotId ? -1 : 1));
  const plots = plotIndices.map((i) => snapshot.plots[i]);
  const byCell = new Map(plots.map((p, i) => [key(p.groundId, p.cellX, p.cellZ), i]));
  const w = config.water;
  const diffusivity = plots.map(() => w.leveledDiffusivity);
  const nodes = plots.map((p) => ({
    id: p.plotId,
    capacity: w.capacity,
    intakeWeight: w.leveledIntakeMultiplier
  }));
  const edges: FieldEdge[] = [];
  plots.forEach((p, a) => {
    for (const d of [0, 2]) {
      const [dx, dz] = WATER_DIRECTIONS[d],
        b = byCell.get(key(p.groundId, p.cellX + dx, p.cellZ + dz));
      if (
        b === undefined ||
        !((p.ground.waterMask ?? 0) & (1 << d)) ||
        !((plots[b].ground.waterMask ?? 0) & (1 << opposite[d]))
      )
        continue;
      const da = diffusivity[a],
        db = diffusivity[b];
      edges.push({
        a,
        b,
        conductance: da + db === 0 ? 0 : (w.capacity * 2 * da * db) / (da + db) / snapshot.grid.cellSize ** 2,
        sinceMs: Math.max(
          p.ground.waterSinceMs?.[d] ?? Infinity,
          plots[b].ground.waterSinceMs?.[opposite[d]] ?? Infinity
        )
      });
    }
  });
  return { nodes, edges, plotIndices };
}

export interface FieldValueResult {
  readonly fieldId: "soilMoisture";
  readonly revision: number;
  readonly groundRevision: number;
  readonly values: readonly ({
    readonly plotId: string;
    readonly value: number;
    readonly availability: PlotGroundState["availability"];
  } | null)[];
}
