import type { FarmingSimulationConfig } from "../../config/FarmingSimulationConfig";
import type { FarmSnapshot, PlotState } from "../FarmState";
import {
  boundsIntersect,
  groundState,
  inspectGround,
  plotBounds,
  sameGroundCell,
  type FarmingGroundChange,
  type FarmingGroundView,
  type GroundTarget,
  type PlotGrid,
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

function connectionBounds(grid: PlotGrid, a: GroundTarget, b: GroundTarget) {
  const left = plotBounds(grid, a);
  const right = plotBounds(grid, b);
  return {
    minimumX: Math.min(left.minimumX, right.minimumX),
    maximumX: Math.max(left.maximumX, right.maximumX),
    minimumZ: Math.min(left.minimumZ, right.minimumZ),
    maximumZ: Math.max(left.maximumZ, right.maximumZ)
  };
}

function permitsWater(inspection: ReturnType<FarmingGroundView["inspectBounds"]>): boolean {
  return (
    inspection.covered &&
    !inspection.blocked &&
    !inspection.underwater &&
    inspection.surfaces.length > 0 &&
    inspection.surfaces.every((surface) => surface === "soil" || surface === "grass")
  );
}

export interface WaterLayoutChange {
  readonly moved: ReadonlySet<string>;
  readonly changedCells: readonly GroundTarget[];
  readonly previousPlots: ReadonlyMap<string, PlotState>;
}

/** A replacement can change the plot layout while the terrain revision stays fixed. */
export function diffWaterLayout(snapshot: FarmSnapshot, previous: FarmSnapshot): WaterLayoutChange | undefined {
  if (
    snapshot.plots.length === previous.plots.length &&
    snapshot.plots.every((plot, i) => {
      const old = previous.plots[i];
      return plot.plotId === old.plotId && sameGroundCell(plot, old);
    })
  )
    return;

  const priorById = new Map(previous.plots.map((plot) => [plot.plotId, plot]));
  const nextById = new Map(snapshot.plots.map((plot) => [plot.plotId, plot]));
  const moved = new Set<string>();
  const changedCells: GroundTarget[] = [];
  for (const plot of snapshot.plots) {
    const old = priorById.get(plot.plotId);
    if (old && sameGroundCell(old, plot)) continue;
    moved.add(plot.plotId);
    changedCells.push(plot);
  }
  for (const plot of previous.plots) if (!nextById.has(plot.plotId) || moved.has(plot.plotId)) changedCells.push(plot);
  if (changedCells.length) return { moved, changedCells, previousPlots: priorById };
}

function continuousWaterSince(
  previousPlots: ReadonlyMap<string, PlotState>,
  plot: PlotState,
  neighbor: PlotState,
  revision: number
): number | undefined {
  const oldPlot = previousPlots.get(plot.plotId);
  const oldNeighbor = previousPlots.get(neighbor.plotId);
  if (
    !oldPlot ||
    !oldNeighbor ||
    oldPlot.groundId !== plot.groundId ||
    oldNeighbor.groundId !== neighbor.groundId ||
    oldPlot.ground.waterCheckedRevision !== revision ||
    oldNeighbor.ground.waterCheckedRevision !== revision
  )
    return;
  const direction = WATER_DIRECTIONS.findIndex(
    ([dx, dz]) => oldPlot.cellX + dx === oldNeighbor.cellX && oldPlot.cellZ + dz === oldNeighbor.cellZ
  );
  if (
    direction < 0 ||
    !((oldPlot.ground.waterMask ?? 0) & (1 << direction)) ||
    !((oldNeighbor.ground.waterMask ?? 0) & (1 << opposite[direction]))
  )
    return;
  const a = oldPlot.ground.waterSinceMs?.[direction];
  const b = oldNeighbor.ground.waterSinceMs?.[opposite[direction]];
  if (a !== undefined && b !== undefined) return Math.max(a, b);
}

export function refreshWaterLayout(
  snapshot: FarmSnapshot,
  { moved, changedCells, previousPlots }: WaterLayoutChange,
  time: number,
  view?: FarmingGroundView,
  sameTimeBasis = false
): FarmSnapshot {
  const byCell = new Map(snapshot.plots.map((plot) => [key(plot.groundId, plot.cellX, plot.cellZ), plot]));
  const affected = new Set<string>(moved);
  for (const plot of changedCells)
    for (const [dx, dz] of WATER_DIRECTIONS) {
      const neighbor = byCell.get(key(plot.groundId, plot.cellX + dx, plot.cellZ + dz));
      if (neighbor) affected.add(neighbor.plotId);
    }
  const connections = new Map<string, number | null>();
  const plots = snapshot.plots.map((plot) => {
    if (!affected.has(plot.plotId)) return plot;
    const relocated = moved.has(plot.plotId);
    const ground =
      relocated && view
        ? groundState(inspectGround(view, snapshot.grid, plot, plot.plotId), time, plot.ground)
        : plot.ground;
    let mask = 0;
    const since = WATER_DIRECTIONS.map(([dx, dz], direction) => {
      const neighbor = byCell.get(key(plot.groundId, plot.cellX + dx, plot.cellZ + dz));
      if (!neighbor) return 0;
      if (!relocated && !moved.has(neighbor.plotId)) {
        if (!((ground.waterMask ?? 0) & (1 << direction))) return 0;
        mask |= 1 << direction;
        return ground.waterSinceMs?.[direction] ?? time;
      }
      // Inactive farms have no ground view. Leave new connections unconfirmed
      // so reopening cannot credit water across them retroactively.
      if (!view) return 0;
      const start = direction === 0 || direction === 2 ? plot : neighbor;
      const edge = `${start.plotId}:${direction < 2 ? 0 : 2}`;
      if (!connections.has(edge)) {
        const connected = permitsWater(
          view.inspectBounds(plot.groundId, connectionBounds(snapshot.grid, plot, neighbor))
        );
        const since =
          connected && sameTimeBasis ? continuousWaterSince(previousPlots, plot, neighbor, view.revision) : undefined;
        // Only a verified equivalent connection can span a fixed simulation step that crosses this edit.
        connections.set(edge, connected ? (since ?? time) : null);
      }
      const since = connections.get(edge);
      if (since == null) return 0;
      mask |= 1 << direction;
      return since;
    });
    return {
      ...plot,
      ground: {
        ...ground,
        waterMask: mask,
        waterSinceMs: since,
        waterCheckedRevision: relocated && view ? view.revision : (ground.waterCheckedRevision ?? ground.groundRevision)
      }
    };
  });
  return { ...snapshot, plots };
}

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
      const bounds = connectionBounds(snapshot.grid, p, n);
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
      if (!permitsWater(view.inspectBounds(p.groundId, bounds))) continue;
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
