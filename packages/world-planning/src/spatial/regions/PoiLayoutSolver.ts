import type { PlanPoint } from "../../semantic-study/IslandPlanModel";
import type { PoiDistribution, PoiSite } from "../../semantic-study/PoiDistribution";
import { createPlanningRingQuery } from "../../semantic-study/WorldPlanningTerrain";
import { ringArea } from "../../semantic-study/WorldPlanningGeometry";

/** Explicit position fixes an anchor; a weight alone permits deterministic neighbour relaxation. */
export interface PoiLayoutOverride {
  sizeWeight?: number;
  x?: number;
  z?: number;
}
export interface PoiCell {
  poiId: string;
  domainId: string;
  outline: PlanPoint[];
  weightM2: number;
}
const EPSILON_AREA = 1e-8;
const RELAXATION_STEPS = 6;

/** Clip a polygon by a closed half-plane; the same operator serves previews and committed geometry. */
function clip(points: readonly PlanPoint[], side: (p: PlanPoint) => number): PlanPoint[] {
  const result: PlanPoint[] = [];
  for (let i = 0; i < points.length; i++) {
    const p = points[i],
      q = points[(i + 1) % points.length],
      u = side(p),
      v = side(q);
    if (u <= 0) result.push({ ...p });
    if (u <= 0 !== v <= 0) {
      const t = u / (u - v);
      result.push({ x: p.x + (q.x - p.x) * t, z: p.z + (q.z - p.z) * t });
    }
  }
  return result;
}

/** Compute power cells for active sites; dormant identities receive an empty outline.
 * @param sites Current positions and metric power offsets.
 * @param bounds Outer map rectangle.
 * @param partitionByDomain Whether different land domains compete.
 * @returns Convex cells in input identity order.
 */
export function computePoiCells(
  sites: readonly PoiSite[],
  bounds: { x0: number; z0: number; x1: number; z1: number },
  partitionByDomain = true
): PoiCell[] {
  return sites.map((a) => {
    let outline: PlanPoint[] = a.active
      ? [
          { x: bounds.x0, z: bounds.z0 },
          { x: bounds.x1, z: bounds.z0 },
          { x: bounds.x1, z: bounds.z1 },
          { x: bounds.x0, z: bounds.z1 }
        ]
      : [];
    for (const b of sites) {
      if (!outline.length) break;
      if (!b.active || a.id === b.id || (partitionByDomain && a.domainId !== b.domainId)) continue;
      const dx = b.center.x - a.center.x,
        dz = b.center.z - a.center.z;
      if (dx === 0 && dz === 0 && a.weightM2 === b.weightM2) {
        if (a.id.localeCompare(b.id) > 0) outline = [];
        continue;
      }
      const k = (b.center.x ** 2 + b.center.z ** 2 - a.center.x ** 2 - a.center.z ** 2 + a.weightM2 - b.weightM2) / 2;
      outline = clip(outline, (p) => p.x * dx + p.z * dz - k);
    }
    return { poiId: a.id, domainId: a.domainId, outline, weightM2: a.weightM2 };
  });
}

/** Intersect a possibly concave domain with a convex power cell.
 * @param domain Land-domain boundary, possibly concave.
 * @param cell Convex power-cell boundary; empty represents a dormant owner.
 * @returns The clipped land boundary, or an empty outline.
 */
export function clipPoiLand(domain: readonly PlanPoint[], cell: readonly PlanPoint[]): PlanPoint[] {
  if (!cell.length) return [];
  let result = [...domain];
  for (let i = 0; i < cell.length && result.length; i++) {
    const a = cell[i],
      b = cell[(i + 1) % cell.length];
    result = clip(result, (p) => -(b.x - a.x) * (p.z - a.z) + (b.z - a.z) * (p.x - a.x));
  }
  return result;
}

function centroid(points: readonly PlanPoint[], fallback: PlanPoint): PlanPoint {
  let area = 0,
    x = 0,
    z = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i],
      b = points[(i + 1) % points.length],
      cross = a.x * b.z - b.x * a.z;
    area += cross;
    x += (a.x + b.x) * cross;
    z += (a.z + b.z) * cross;
  }
  return Math.abs(area) > EPSILON_AREA ? { x: x / (3 * area), z: z / (3 * area) } : { ...fallback };
}

/** Resolve candidates from immutable origins, never from the preceding preview's positions.
 * @param input Complete candidate pool, land domains and unified metric controls.
 * @param overrides Complete author input; omitted means reuse this distribution's author input.
 * @returns A detached distribution with stable active/dormant identities and solved positions.
 * @throws For invalid author coordinates, weights or non-finite metric offsets.
 */
export function solvePoiDistribution(
  input: PoiDistribution,
  overrides: Record<string, PoiLayoutOverride> = input.overrides ?? {}
): PoiDistribution {
  const domains = new Map(input.domains.map((d) => [d.id, { ...d, query: createPlanningRingQuery(d.outline) }]));
  const points = input.domains.flatMap((d) => d.outline);
  const bounds = {
    x0: Math.min(0, ...points.map((p) => p.x)),
    z0: Math.min(0, ...points.map((p) => p.z)),
    x1: Math.max(1, ...points.map((p) => p.x)),
    z1: Math.max(1, ...points.map((p) => p.z))
  };
  const old = new Map(input.sites.map((s) => [s.id, s]));
  const sites: PoiSite[] = input.candidates.map((candidate) => {
    const edit = overrides[candidate.id] ?? {},
      center = { x: edit.x ?? candidate.origin.x, z: edit.z ?? candidate.origin.z };
    const sizeWeight = edit.sizeWeight ?? candidate.sizeWeight ?? 1;
    const weightM2 = input.spacingM ** 2 * (sizeWeight - 1);
    if (
      !Number.isFinite(sizeWeight) ||
      sizeWeight < 0.001 ||
      !Number.isFinite(weightM2) ||
      ![center.x, center.z].every((n) => Number.isFinite(n) && n >= 0)
    )
      throw new Error("POI 权重或锚点无效");
    const domainId = [...domains.values()].find((d) => d.query.inside(center))?.id ?? candidate.domainId;
    return {
      id: candidate.id,
      origin: { ...candidate.origin },
      center,
      domainId,
      sizeWeight,
      weightM2,
      areaM2: 0,
      active: (!candidate.reserve || Object.keys(edit).length > 0) && domains.has(domainId),
      memberIds: old.get(candidate.id)?.memberIds ?? []
    };
  });
  // Tiny domains may contain only reserve grid cells. Their first stable identity starts the domain.
  for (const domainId of domains.keys())
    if (!sites.some((s) => s.domainId === domainId && s.active)) {
      const first = sites.find((s) => s.domainId === domainId);
      if (first) first.active = true;
    }
  let outlines: PlanPoint[][] = [];
  const measure = () => {
    outlines = computePoiCells(sites, bounds).map((cell) =>
      clipPoiLand(domains.get(cell.domainId)?.outline ?? [], cell.outline)
    );
    sites.forEach((site, i) => {
      site.areaM2 = outlines[i].length ? ringArea(outlines[i]) : 0;
    });
  };
  const prune = () => {
    // Remove the smallest failing owner first, allowing its neighbours to inherit the freed area.
    // Every pass removes an identity, so work is bounded by the finite candidate pool.
    for (let pass = 0; pass <= sites.length; pass++) {
      measure();
      const failed = sites
        .filter((s) => s.active && (s.areaM2 <= EPSILON_AREA || s.areaM2 < input.minAreaM2))
        .sort((a, b) => a.areaM2 - b.areaM2 || a.id.localeCompare(b.id));
      if (!failed.length) return;
      failed[0].active = false;
    }
  };
  const relax = () => {
    for (let step = 0; step < RELAXATION_STEPS; step++) {
      prune();
      sites.forEach((site, i) => {
        const edit = overrides[site.id];
        if (!site.active || edit?.x !== undefined || edit?.z !== undefined) return;
        const target = centroid(outlines[i], site.center),
          query = domains.get(site.domainId)!.query;
        // Concave-domain centroids can lie outside land. Choose the closest boundary/origin deterministically.
        site.center = query.inside(target)
          ? target
          : [site.origin, ...outlines[i]].reduce(
              (best, p) =>
                Math.hypot(p.x - target.x, p.z - target.z) < Math.hypot(best.x - target.x, best.z - target.z)
                  ? { ...p }
                  : best,
              { ...site.origin }
            );
      });
    }
    prune();
  };
  relax();
  // Admit reserves only into an oversized owner's surplus; high-weight owners retain their target space.
  let admitted = false;
  for (const candidate of input.candidates.filter((c) => c.reserve).sort((a, b) => a.id.localeCompare(b.id))) {
    const index = sites.findIndex((s) => s.id === candidate.id),
      site = sites[index];
    if (site.active) continue;
    const owners = sites
      .filter((s) => s.active && s.domainId === site.domainId)
      .sort(
        (a, b) =>
          (site.center.x - a.center.x) ** 2 +
            (site.center.z - a.center.z) ** 2 -
            a.weightM2 -
            ((site.center.x - b.center.x) ** 2 + (site.center.z - b.center.z) ** 2 - b.weightM2) ||
          a.id.localeCompare(b.id)
      );
    const owner = owners[0];
    if (!owner) continue;
    const targetArea = input.spacingM ** 2 * (owner.sizeWeight ?? 1);
    if (owner.areaM2 <= 2 * Math.max(targetArea, input.minAreaM2)) continue;
    site.active = true;
    measure();
    if (
      site.areaM2 <= EPSILON_AREA ||
      site.areaM2 < input.minAreaM2 ||
      owner.areaM2 < Math.max(targetArea, input.minAreaM2)
    ) {
      site.active = false;
      measure();
    } else admitted = true;
  }
  if (admitted) relax();
  for (const site of sites) if (!site.active) site.memberIds = [];
  const active = sites.filter((s) => s.active);
  let separation = Infinity;
  for (let i = 0; i < active.length; i++)
    for (let j = i + 1; j < active.length; j++)
      separation = Math.min(
        separation,
        Math.hypot(active[i].center.x - active[j].center.x, active[i].center.z - active[j].center.z)
      );
  return {
    ...input,
    sites,
    overrides: structuredClone(overrides),
    metrics: {
      ...input.metrics,
      count: active.length,
      candidateCount: sites.length,
      dormantCount: sites.length - active.length,
      minSeparationM: Number.isFinite(separation) ? separation : null,
      maxUncoveredM: active.length
        ? Math.max(
            0,
            ...input.candidates.map((c) =>
              Math.min(...active.map((s) => Math.hypot(c.origin.x - s.center.x, c.origin.z - s.center.z)))
            )
          )
        : 0
    }
  };
}
