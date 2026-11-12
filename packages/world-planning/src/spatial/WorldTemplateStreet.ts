import type { IslandPlan, PlanPoint } from "../semantic-study/IslandPlanModel";
import { WORLD_TEMPLATE_ART } from "./WorldTemplateArtDirection";

export function worldTemplateStreet(plan: IslandPlan) {
  const id = plan.parameters.worldTemplate?.id;
  if (!id || !WORLD_TEMPLATE_ART[id]?.streetSigns) return undefined;
  return plan.spatialLayout?.groups.find(
    (group) => group.volumes.length && (group.construction?.spine?.length ?? 0) > 1
  );
}

const streetPuddles = new WeakMap<IslandPlan, ReturnType<typeof createStreetPuddles>>();

export function worldTemplateStreetPuddles(plan: IslandPlan) {
  if (plan.parameters.worldTemplate?.id !== "neon-alley") return undefined;
  if (!streetPuddles.has(plan)) streetPuddles.set(plan, createStreetPuddles(plan));
  return streetPuddles.get(plan);
}

function createStreetPuddles(plan: IslandPlan) {
  const street = worldTemplateStreet(plan);
  const spine = street?.construction?.spine;
  if (!street || !spine) return undefined;

  const segments: { start: PlanPoint; ux: number; uz: number; size: number; station: number }[] = [];
  let length = 0;
  for (let i = 1; i < spine.length; i++) {
    const start = spine[i - 1];
    const dx = spine[i].x - start.x;
    const dz = spine[i].z - start.z;
    const size = Math.hypot(dx, dz);
    if (!size) continue;
    segments.push({ start, ux: dx / size, uz: dz / size, size, station: length });
    length += size;
  }
  if (!length) return undefined;

  function project(x: number, z: number) {
    let distanceSquared = Infinity;
    let station = 0;
    let lateral = 0;
    for (const { start, ux, uz, size, station: base } of segments) {
      const dx = x - start.x;
      const dz = z - start.z;
      const along = dx * ux + dz * uz;
      const clamped = Math.max(0, Math.min(size, along));
      const distance = (dx - ux * clamped) ** 2 + (dz - uz * clamped) ** 2;
      if (distance < distanceSquared) {
        distanceSquared = distance;
        station = base + along;
        lateral = dz * ux - dx * uz;
      }
    }
    return { station, lateral };
  }

  const stations = street.volumes.map(({ boxes: [box] }) => project(box.center.x, box.center.z).station);
  const start = Math.max(0, Math.min(...stations) - 8);
  const end = Math.min(length, Math.max(...stations) + 7);
  const halfWidth = street.rule.pathWidthM / 2;
  const pools: { station: number; lateral: number; across: number; along: number; depth: number }[] = [];
  for (let station = start + 6, i = 0; station < end - 2; station += 8 + 1.5 * (1 + Math.sin(i * 2.4)), i++) {
    pools.push({
      station,
      lateral: (i % 2 ? -1 : 1) * halfWidth * (0.32 + 0.1 * Math.sin(i * 1.7)),
      across: halfWidth * (0.33 + 0.06 * Math.cos(i * 2.1)),
      along: 2.8 + 0.65 * Math.sin(i * 1.3),
      depth: 0.034 + (0.009 * (1 + Math.sin(i * 2.2))) / 2
    });
  }

  const padding = halfWidth + 2;
  const minX = Math.min(...spine.map((point) => point.x)) - padding;
  const maxX = Math.max(...spine.map((point) => point.x)) + padding;
  const minZ = Math.min(...spine.map((point) => point.z)) - padding;
  const maxZ = Math.max(...spine.map((point) => point.z)) + padding;

  return {
    basinCount: pools.length,
    sample(x: number, z: number) {
      if (x < minX || x > maxX || z < minZ || z > maxZ) return undefined;
      const { station, lateral } = project(x, z);
      const bank = halfWidth * (0.72 + 0.1 * Math.sin(station * 0.48));
      const drift = halfWidth * 0.13 * Math.sin(station * 0.33);
      const edge = Math.min(bank - Math.abs(lateral - drift), station - start, end - station);
      if (edge <= -0.75) return undefined;

      const shallow = smoothstep(-0.75, 0.65, edge);
      let deep = 0;
      let depthMetres = 0.006 * shallow;
      for (const pool of pools) {
        const along = station - pool.station;
        if (Math.abs(along) > pool.along * 1.4) continue;
        const across = lateral - pool.lateral;
        const contour = 1 - Math.hypot(along / pool.along, across / pool.across);
        const weight = smoothstep(-0.36, 0.45, contour) * shallow;
        deep = Math.max(deep, weight);
        depthMetres = Math.max(depthMetres, pool.depth * smoothstep(-0.25, 0.75, contour) * shallow);
      }

      return {
        depthMetres,
        depthClass: 0.37 * shallow * (1 - deep) + deep,
        fillThreshold: 0.14 + (0.33 + 0.25 * (1 - shallow)) * (1 - deep)
      };
    }
  };
}

function smoothstep(from: number, to: number, value: number): number {
  const t = Math.max(0, Math.min(1, (value - from) / (to - from)));
  return t * t * (3 - 2 * t);
}
