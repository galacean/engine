import { MAX_WATER_CONNECTION_PORTS } from "@galacean/engine-water/water/authoring/connections/WaterConnection";
import type { IslandPlan, PlanPoint } from "../../semantic-study/IslandPlanModel";
import { createPlanningRingQuery } from "../../semantic-study/WorldPlanningTerrain";
import { ribbonOutline } from "../../semantic-study/WorldRibbon";

export interface TerrainRiverMouth {
  section: readonly [readonly [number, number], readonly [number, number]];
  transitionLengths: readonly [number, number];
}

/** Extend the existing generated corridor to a real submerged coastal section. All changes feed the
 * same bed/surface profiles as the inland reach; native connection compilation remains authoritative.
 */
export function connectTerrainRiverMouths(plan: IslandPlan, ground: (p: PlanPoint) => number) {
  if (plan.waters.filter((w) => w.kind === "river").length > MAX_WATER_CONNECTION_PORTS)
    throw new Error(
      `RESOURCE_LIMIT: One native Ocean accepts at most ${MAX_WATER_CONNECTION_PORTS} river connections.`
    );
  const mouths = new Map<string, TerrainRiverMouth>();
  const lands = [plan.land, ...plan.islands].map(createPlanningRingQuery);
  for (const water of plan.waters) {
    if (water.kind !== "river") continue;
    const surface = plan.planning!.profiles.find((p) => p.ownerId === water.id && p.kind === "water")!;
    const bed = plan.planning!.profiles.find((p) => p.ownerId === water.id && p.kind === "bed")!;
    const end = surface.points.at(-1)!,
      before = surface.points.at(-2)!;
    if (surface.points.some((p) => p.y < 0))
      throw new Error(`TERRAIN_CHANGE_REQUIRED: ${water.id} lies below sea level and cannot drain into Ocean.`);
    const width = water.widths!.at(-1)!,
      half = width / 2;
    const heading = Math.atan2(end.z - before.z, end.x - before.x);
    let best: { points: PlanPoint[]; length: number; nx: number; nz: number } | undefined;
    const obstacles = plan.waters
      .filter((other) => other !== water)
      .map((other) => createPlanningRingQuery(other.outline));
    // Search finite forward fans; no arbitrary teleport or inland endpoint is accepted as a mouth.
    for (const offset of [0, -15, 15, -30, 30, -45, 45, -60, 60]) {
      const angle = heading + (offset * Math.PI) / 180,
        dx = Math.cos(angle),
        dz = Math.sin(angle),
        nx = -dz,
        nz = dx;
      const points: PlanPoint[] = [];
      let exited = false;
      for (let distance = 2; distance <= Math.hypot(plan.parameters.width, plan.parameters.depth); distance += 2) {
        const p = { x: end.x + dx * distance, z: end.z + dz * distance };
        if (
          p.x < half + 2 ||
          p.z < half + 2 ||
          p.x > plan.parameters.width - half - 2 ||
          p.z > plan.parameters.depth - half - 2
        )
          break;
        const onLand = lands.some((q) => q.inside(p));
        if (exited && onLand) break;
        exited ||= !onLand;
        if (obstacles.some((other) => other.within(p, half + 2))) break;
        points.push(p);
        const cross = [-half, 0, half].map((t) => ({ x: p.x + nx * t, z: p.z + nz * t }));
        if (exited && cross.every((q) => !lands.some((land) => land.within(q, 4)) && ground(q) < -0.05)) {
          if (!best || distance < best.length) best = { points, length: distance, nx, nz };
          break;
        }
      }
    }
    if (!best) throw new Error(`TERRAIN_CHANGE_REQUIRED: ${water.id} has no feasible submerged coastal mouth.`);
    const depth = end.y - bed.points.at(-1)!.y;
    const oldCount = surface.points.length;
    for (const p of best.points) {
      surface.points.push({ ...p, y: 0 });
      bed.points.push({ ...p, y: -depth });
      water.widths!.push(width);
      water.bankWidths!.push(water.bankWidthM!);
    }
    // Lower the approach monotonically with a bounded ordinary slope; never raise existing water.
    for (let i = surface.points.length - 2; i >= 0; i--) {
      const a = surface.points[i],
        b = surface.points[i + 1];
      const originalDepth = i < oldCount ? a.y - bed.points[i].y : depth;
      a.y = Math.min(a.y, b.y + Math.hypot(a.x - b.x, a.z - b.z) * 0.15);
      bed.points[i].y = a.y - originalDepth;
    }
    water.centerline = surface.points.map(({ x, z }) => ({ x, z }));
    water.outline = ribbonOutline(water.centerline, water.widths, undefined, true);
    water.course = undefined;
    const p = surface.points.at(-2)!;
    mouths.set(water.id, {
      section: [
        [p.x + best.nx * half, p.z + best.nz * half],
        [p.x - best.nx * half, p.z - best.nz * half]
      ],
      transitionLengths: [2, 2]
    });
  }
  return mouths;
}
