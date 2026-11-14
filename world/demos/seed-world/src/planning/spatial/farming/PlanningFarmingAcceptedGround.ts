import { planeSurfaceTriangles } from "@galacean/engine-terrain/geometry/SurfaceTriangles";
import type {
  FarmSnapshot,
  FarmingGroundView,
  GroundBounds,
  PlotGrid,
  PlotDefinition,
  FarmStorageState,
  FarmingStorageDefinitions
} from "@galacean/engine-farming/farming/api/index";
import { cellBounds, containerBounds } from "@galacean/engine-farming/farming/storage/StoragePlacement";
import { createPlanningFarmingTerrainQuery } from "./PlanningFarmingTerrain.ts";
import type { PlanningFarmingTerrain } from "./PlanningPublishedFarmingGround.ts";
import { createPlanningFarmingGroundView } from "@galacean/engine-world-planning/spatial/farming/PlanningFarmingGround";

type Layout = { grid: PlotGrid; plots: readonly PlotDefinition[]; storage: FarmStorageState };
const contains = (a: GroundBounds, b: GroundBounds) =>
  a.minimumX <= b.minimumX + 1e-8 &&
  a.maximumX >= b.maximumX - 1e-8 &&
  a.minimumZ <= b.minimumZ + 1e-8 &&
  a.maximumZ >= b.maximumZ - 1e-8;

/** Accepted facilities survive later planning changes. New placements still query physical ground. */
export function acceptedPlanningFarmingGround(
  fields: PlanningFarmingTerrain,
  revision: number,
  groundId: string,
  initial: Layout,
  readSnapshot: () => FarmSnapshot | undefined,
  physical: () => FarmingGroundView,
  definitions: FarmingStorageDefinitions
): FarmingGroundView {
  const terrain = createPlanningFarmingTerrainQuery(fields);
  const occupied = () => {
    const snapshot = readSnapshot();
    const grid = snapshot?.grid ?? initial.grid;
    const plots = snapshot?.plots ?? initial.plots.map((p) => ({ ...p.target!, plotId: p.id }));
    const containers = snapshot?.storage.containers ?? initial.storage.containers;
    const cells: { id: string; bounds: GroundBounds; height?: number }[] = plots.map((p) => ({
      id: p.groundId,
      bounds: cellBounds(grid, p)
    }));
    const areas = [...cells];
    // A neighbour pair is also the support of soil-water transport between these committed cells.
    const byCell = new Map(plots.map((p, i) => [`${p.groundId}/${p.cellX}/${p.cellZ}`, i]));
    for (let i = 0; i < plots.length; i++)
      for (const [dx, dz] of [
        [1, 0],
        [0, 1]
      ]) {
        const a = plots[i],
          j = byCell.get(`${a.groundId}/${a.cellX + dx}/${a.cellZ + dz}`);
        if (j === undefined) continue;
        const x = cells[i].bounds,
          y = cells[j].bounds;
        areas.push({
          id: a.groundId,
          bounds: {
            minimumX: Math.min(x.minimumX, y.minimumX),
            maximumX: Math.max(x.maximumX, y.maximumX),
            minimumZ: Math.min(x.minimumZ, y.minimumZ),
            maximumZ: Math.max(x.maximumZ, y.maximumZ)
          }
        });
      }
    for (const container of containers) {
      const type = definitions.containers.find((t) => t.id === container.typeId);
      if (type)
        areas.unshift({
          id: container.groundId,
          bounds: containerBounds(container, type),
          height: container.position[1]
        });
    }
    return areas;
  };
  let snapshotKey: FarmSnapshot | undefined,
    areas = occupied();
  const accepted = (id: string, bounds: GroundBounds) => {
    const snapshot = readSnapshot();
    if (snapshot !== snapshotKey) {
      snapshotKey = snapshot;
      areas = occupied();
    }
    return areas.find((a) => a.id === id && contains(a.bounds, bounds));
  };
  const sample: FarmingGroundView["sample"] = (id, x, z) => {
    const area = accepted(id, { minimumX: x, maximumX: x, minimumZ: z, maximumZ: z });
    if (!area) return physical().sample(id, x, z);
    const point = terrain.sample(x, z);
    // Old cells outside today's terrain retain their coordinates and use the nearest available ground height.
    const ox = fields.worldOrigin?.[0] ?? 0,
      oz = fields.worldOrigin?.[1] ?? 0;
    const fallback =
      point ??
      terrain.sample(
        Math.max(ox, Math.min(ox + fields.sizeMetres, x)),
        Math.max(oz, Math.min(oz + fields.sizeMetres, z))
      );
    return { position: [x, area.height ?? fallback?.position[1] ?? 0, z], normal: [0, 1, 0], surface: "soil" };
  };
  const raycast = createPlanningFarmingGroundView({
    revision,
    groundId,
    domains: [
      [
        { x: 0, z: 0 },
        { x: fields.sizeMetres, z: 0 },
        { x: fields.sizeMetres, z: fields.sizeMetres },
        { x: 0, z: fields.sizeMetres }
      ]
    ],
    height: (x, z) => terrain.sample(x, z)?.position[1] ?? null,
    underwater: () => false,
    blocked: () => false
  }).raycast;
  return {
    revision,
    sample,
    raycast,
    surfaceTriangles(id, bounds) {
      const area = accepted(id, bounds);
      if (!area) {
        const view = physical();
        if (!view.surfaceTriangles) throw new Error("Physical farming ground does not provide surface triangles");
        return view.surfaceTriangles(id, bounds);
      }
      if (area.height !== undefined) return planeSurfaceTriangles(bounds, area.height);
      return terrain.clampedSurfaceTriangles(bounds);
    },
    inspectBounds(id, bounds) {
      if (!accepted(id, bounds)) return physical().inspectBounds(id, bounds);
      return { covered: true, blocked: false, underwater: false, maximumSlopeDegrees: 0, surfaces: ["soil"] };
    }
  };
}
