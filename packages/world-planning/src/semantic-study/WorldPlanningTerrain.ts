import { bridgeApproachGradingSampler } from "@galacean/engine-water/bridges/BridgeApproach";
import { planningRiverBankHeight, riverBankReach } from "./PlanningRiverBank";
import { watercourseGeometry } from "@galacean/engine-water/water/index";
import { fitFoundationLevels, gradeLimitedBed } from "../spatial/terrain/TerrainGrade";
import { authoredTerrainDisplacement } from "../spatial/terrain/AuthoredTerrain";
import { planningLakeGround } from "../spatial/hydrology/AuthoredLakes";
import { isPlanningTerrainResource } from "../spatial/PlanningResources";
import roadLimits from "../planning-data/road-network.json";
import { worldElevationField } from "../spatial/terrain/WorldElevation";
import { reliefField } from "../spatial/terrain/ReliefField";
import { poiRegionElevationSampler } from "../spatial/terrain/PoiRegionElevation";
import { crosses } from "./WorldPlanningGeometry";
import type { IslandPlan, PlanPoint } from "./IslandPlanModel";
import type { PlanningProfile } from "./WorldPlanningContract";
import { pointInPolygon } from "../geometry/V2Geometry";

const smooth = (v: number) => {
  const t = Math.max(0, Math.min(1, v));
  return t * t * (3 - 2 * t);
};
/** Seeded value-noise octaves use fixed world coordinates so local edits do not move the relief. */
function relief(seed: number, p: PlanPoint): number {
  const lattice = (x: number, z: number) => {
    let n = Math.imul(x, 374761393) ^ Math.imul(z, 668265263) ^ seed;
    n = Math.imul(n ^ (n >>> 13), 1274126177);
    return (((n ^ (n >>> 16)) >>> 0) / 4294967295) * 2 - 1;
  };
  let value = 0,
    amplitude = 1,
    scale = 320;
  for (let octave = 0; octave < 4; octave++) {
    const x = p.x / scale,
      z = p.z / scale,
      ix = Math.floor(x),
      iz = Math.floor(z),
      u = smooth(x - ix),
      v = smooth(z - iz);
    const a = lattice(ix, iz),
      b = lattice(ix + 1, iz),
      c = lattice(ix, iz + 1),
      d = lattice(ix + 1, iz + 1);
    value += amplitude * ((a + (b - a) * u) * (1 - v) + (c + (d - c) * u) * v);
    amplitude *= 0.5;
    scale *= 0.5;
  }
  return value * 1.6;
}
/** Coherent raster/detail batches reuse lattice corners, while preserving the original octave arithmetic. */
function createReliefSampler(seed: number): (p: PlanPoint) => number {
  const lattice = (x: number, z: number) => {
    let n = Math.imul(x, 374761393) ^ Math.imul(z, 668265263) ^ seed;
    n = Math.imul(n ^ (n >>> 13), 1274126177);
    return (((n ^ (n >>> 16)) >>> 0) / 4294967295) * 2 - 1;
  };
  const cells = Array.from({ length: 4 }, () => ({ x: NaN, z: NaN, a: 0, b: 0, c: 0, d: 0 }));
  return (p) => {
    let value = 0,
      amplitude = 1,
      scale = 320;
    for (let octave = 0; octave < 4; octave++) {
      const x = p.x / scale,
        z = p.z / scale,
        ix = Math.floor(x),
        iz = Math.floor(z),
        u = smooth(x - ix),
        v = smooth(z - iz),
        cell = cells[octave];
      if (cell.x !== ix || cell.z !== iz) {
        cell.x = ix;
        cell.z = iz;
        cell.a = lattice(ix, iz);
        cell.b = lattice(ix + 1, iz);
        cell.c = lattice(ix, iz + 1);
        cell.d = lattice(ix + 1, iz + 1);
      }
      const { a, b, c, d } = cell;
      value += amplitude * ((a + (b - a) * u) * (1 - v) + (c + (d - c) * u) * v);
      amplitude *= 0.5;
      scale *= 0.5;
    }
    return value * 1.6;
  };
}
function projection(p: PlanPoint, a: PlanPoint, b: PlanPoint): number {
  const dx = b.x - a.x,
    dz = b.z - a.z;
  return Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / (dx * dx + dz * dz || 1)));
}
function edgeDistance(p: PlanPoint, ring: PlanPoint[]): number {
  let best = Infinity;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i],
      b = ring[(i + 1) % ring.length],
      t = projection(p, a, b);
    best = Math.min(best, Math.hypot(p.x - a.x - (b.x - a.x) * t, p.z - a.z - (b.z - a.z) * t));
  }
  return best;
}
export function profileHeight(p: PlanPoint, profile: PlanningProfile): number {
  let height = profile.points[0].y,
    best = Infinity;
  for (let i = 1; i < profile.points.length; i++) {
    const a = profile.points[i - 1],
      b = profile.points[i],
      t = projection(p, a, b),
      d = Math.hypot(p.x - a.x - (b.x - a.x) * t, p.z - a.z - (b.z - a.z) * t);
    if (d < best) {
      best = d;
      height = a.y + (b.y - a.y) * t;
    }
  }
  return height;
}
type ProfileContact = { index: number; t: number };
/** A prepared profile owns its index and one last-point projection, shared by aligned attributes. */
function indexedProfileProjection(points: PlanningProfile["points"]) {
  type Node = { x0: number; x1: number; z0: number; z1: number; ids?: number[]; left?: Node; right?: Node };
  const build = (ids: number[]): Node => {
    const n: Node = { x0: Infinity, x1: -Infinity, z0: Infinity, z1: -Infinity };
    for (const i of ids) {
      const a = points[i - 1],
        b = points[i];
      n.x0 = Math.min(n.x0, a.x, b.x);
      n.x1 = Math.max(n.x1, a.x, b.x);
      n.z0 = Math.min(n.z0, a.z, b.z);
      n.z1 = Math.max(n.z1, a.z, b.z);
    }
    if (ids.length <= 8) n.ids = ids;
    else {
      const x = n.x1 - n.x0 >= n.z1 - n.z0;
      ids.sort((a, b) =>
        x
          ? points[a - 1].x + points[a].x - points[b - 1].x - points[b].x
          : points[a - 1].z + points[a].z - points[b - 1].z - points[b].z
      );
      const mid = ids.length >> 1;
      n.left = build(ids.slice(0, mid));
      n.right = build(ids.slice(mid));
    }
    return n;
  };
  const root = build(points.slice(1).map((_, i) => i + 1));
  const stack: Node[] = [],
    limits: number[] = [];
  const lower = (p: PlanPoint, n: Node) => {
    const dx = Math.max(n.x0 - p.x, 0, p.x - n.x1),
      dz = Math.max(n.z0 - p.z, 0, p.z - n.z1);
    return dx * dx + dz * dz;
  };
  const contact = { index: 0, t: 0 };
  let lastX = NaN,
    lastZ = NaN;
  let prepared: GroundBounds | undefined,
    candidates: number[] = [];
  const sample = (p: PlanPoint) => {
    if (p.x === lastX && p.z === lastZ) return contact;
    lastX = p.x;
    lastZ = p.z;
    let best = Infinity,
      index = Infinity,
      top = 1;
    contact.index = 0;
    contact.t = 0;
    if (prepared && p.x >= prepared[0] && p.z >= prepared[1] && p.x <= prepared[2] && p.z <= prepared[3]) {
      for (const i of candidates) {
        const a = points[i - 1],
          b = points[i],
          t = projection(p, a, b),
          d = Math.hypot(p.x - a.x - (b.x - a.x) * t, p.z - a.z - (b.z - a.z) * t);
        if (d < best || (d === best && i < index)) {
          best = d;
          index = i;
          contact.index = i;
          contact.t = t;
        }
      }
      return contact;
    }
    stack[0] = root;
    limits[0] = lower(p, root);
    while (top) {
      const slot = --top,
        n = stack[slot];
      if (limits[slot] > (best + 1e-10) ** 2) continue;
      if (n.ids) {
        for (const i of n.ids) {
          const a = points[i - 1],
            b = points[i],
            t = projection(p, a, b),
            d = Math.hypot(p.x - a.x - (b.x - a.x) * t, p.z - a.z - (b.z - a.z) * t);
          if (d < best || (d === best && i < index)) {
            best = d;
            index = i;
            contact.index = i;
            contact.t = t;
          }
        }
      } else {
        const a = n.left!,
          b = n.right!,
          da = lower(p, a),
          db = lower(p, b);
        if (da <= db) {
          stack[top] = b;
          limits[top++] = db;
          stack[top] = a;
          limits[top++] = da;
        } else {
          stack[top] = a;
          limits[top++] = da;
          stack[top] = b;
          limits[top++] = db;
        }
      }
    }
    return contact;
  };
  return Object.assign(sample, {
    prepareBounds: (bounds: GroundBounds) => {
      prepared = undefined;
      const center = { x: (bounds[0] + bounds[2]) / 2, z: (bounds[1] + bounds[3]) / 2 },
        nearest = sample(center);
      if (!nearest.index) return;
      const a = points[nearest.index - 1],
        b = points[nearest.index];
      const reach =
        Math.hypot(center.x - a.x - (b.x - a.x) * nearest.t, center.z - a.z - (b.z - a.z) * nearest.t) +
        Math.hypot(bounds[2] - bounds[0], bounds[3] - bounds[1]) / 2 +
        1e-7;
      candidates = [];
      for (let i = 1; i < points.length; i++) {
        const a = points[i - 1],
          b = points[i],
          dx = Math.max(bounds[0] - Math.max(a.x, b.x), 0, Math.min(a.x, b.x) - bounds[2]),
          dz = Math.max(bounds[1] - Math.max(a.z, b.z), 0, Math.min(a.z, b.z) - bounds[3]);
        if (dx * dx + dz * dz <= reach * reach) candidates.push(i);
      }
      prepared = bounds;
    }
  });
}
/** Exact nearest-segment interpolation; ties retain the original profile order. */
function indexedProfileSampler(
  profile: PlanningProfile,
  profileSamplers: WeakMap<PlanningProfile, (p: PlanPoint) => number>,
  sharedProjection?: (p: PlanPoint) => ProfileContact
): (p: PlanPoint) => number {
  let sample = profileSamplers.get(profile);
  if (!sample) {
    const points = profile.points;
    if (points.every((point) => point.y === points[0].y)) sample = () => points[0].y;
    else {
      const project = sharedProjection ?? indexedProfileProjection(points);
      sample = (p) => {
        const { index, t } = project(p),
          a = points[index - 1],
          b = points[index];
        return index ? a.y + (b.y - a.y) * t : points[0].y;
      };
    }
    profileSamplers.set(profile, sample);
  }
  return sample;
}
/** Mountain-owned broad uplands. Height comes from the group, not individual rock bumps.
 * Wide shoulders overlap through the world; each landmass owns its own sources.
 */
export function createPlanningElevationSampler(plan: IslandPlan): (p: PlanPoint) => number {
  const sources = plan.mountains.flatMap((m) => {
    if (plan.structures?.some((s) => s.bankIds.includes(m.id))) return [];
    const rocks = plan.rocks.filter((r) => r.groupId === m.id);
    if (!rocks.length) return [];
    const center = {
      x: rocks.reduce((s, r) => s + r.center.x, 0) / rocks.length,
      z: rocks.reduce((s, r) => s + r.center.z, 0) / rocks.length
    };
    const xx = rocks.reduce((s, r) => s + (r.center.x - center.x) ** 2, 0),
      zz = rocks.reduce((s, r) => s + (r.center.z - center.z) ** 2, 0),
      xz = rocks.reduce((s, r) => s + (r.center.x - center.x) * (r.center.z - center.z), 0),
      angle = 0.5 * Math.atan2(2 * xz, xx - zz);
    const u = Math.cos(angle),
      v = Math.sin(angle),
      points = rocks.flatMap((r) => r.obb),
      along = Math.max(40, ...points.map((p) => Math.abs((p.x - center.x) * u + (p.z - center.z) * v))),
      across = Math.max(30, ...points.map((p) => Math.abs(-(p.x - center.x) * v + (p.z - center.z) * u)));
    const ridge = plan.ridges.find((r) => r.groupId === m.id)?.points ?? [center];
    // The control is a world elevation scale; rock height edits also change their group's prominence.
    const height =
      (plan.parameters.globalElevation ?? 0) *
      Math.max(0.25, Math.min(1.6, Math.max(...rocks.map((r) => r.height)) / 90));
    return [{ center, u, v, along, across, ridge, height, offshore: !!m.offshore }];
  });
  const islands = plan.islands.map(createPlanningRingQuery),
    main = createPlanningRingQuery(plan.land);
  return (p) => {
    const island = islands.findIndex((r) => r.inside(p)),
      onMain = main.inside(p);
    if (!onMain && island < 0) return 0;
    let power = 0;
    for (const source of sources) {
      if (source.offshore !== !onMain) continue;
      if (source.offshore && !islands[island]?.inside(source.center)) continue;
      // A continuous ridge core with broad elliptical shoulders, no lattice noise or per-rock peaks.
      let nearest = Infinity;
      if (source.ridge.length < 2) nearest = Math.hypot(p.x - source.center.x, p.z - source.center.z);
      for (let i = 1; i < source.ridge.length; i++) {
        const a = source.ridge[i - 1],
          b = source.ridge[i],
          t = projection(p, a, b);
        nearest = Math.min(nearest, Math.hypot(p.x - a.x - (b.x - a.x) * t, p.z - a.z - (b.z - a.z) * t));
      }
      const shoulder = Math.max(source.offshore ? 70 : 240, source.across * 2.8),
        dx = p.x - source.center.x,
        dz = p.z - source.center.z;
      const axial = (dx * source.u + dz * source.v) / Math.max(shoulder, source.along * 2.2);
      const influence = Math.exp(-0.5 * (nearest / shoulder) ** 2 - 0.16 * axial ** 4);
      power += (source.height * influence) ** 8;
    }
    let height = power ** 0.125;
    if (onMain)
      for (const s of plan.structures ?? []) {
        let best = Infinity,
          along = 0,
          total = s.axis.slice(1).reduce((sum, b, i) => sum + Math.hypot(b.x - s.axis[i].x, b.z - s.axis[i].z), 0),
          travel = 0;
        for (let i = 1; i < s.axis.length; i++) {
          const a = s.axis[i - 1],
            b = s.axis[i],
            t = projection(p, a, b),
            length = Math.hypot(b.x - a.x, b.z - a.z),
            d = Math.hypot(p.x - a.x - (b.x - a.x) * t, p.z - a.z - (b.z - a.z) * t);
          if (d < best) {
            best = d;
            along = (travel + t * length) / total;
          }
          travel += length;
        }
        const floor = s.sourceHeight + (s.outletHeight - s.sourceHeight) * along;
        const rise = smooth((best - s.floorWidth * 0.35) / (s.floorWidth * 0.15 + s.bankWidth * 0.65));
        const shoulder = Math.exp(-(Math.max(0, best - s.floorWidth / 2 - s.bankWidth) ** 2) / (2 * 240 ** 2));
        const target = (floor + s.relief * rise) * shoulder;
        // The valley is a negative space in its surrounding upland, not a mound under every rock.
        const weight = 1 - smooth((best - s.floorWidth / 2 - s.bankWidth) / 240);
        height = height * (1 - weight) + target * weight;
      }
    return height;
  };
}
/** Shared elevation potential for terrain and river source selection. Sea is zero. */
export function globalPlanningElevation(plan: IslandPlan, p: PlanPoint): number {
  return createPlanningElevationSampler(plan)(p);
}
/** Downhill direction from the same field, not the island orientation. */
export function planningDownhill(sample: (p: PlanPoint) => number, p: PlanPoint): number {
  const d = 16,
    dx = sample({ x: p.x + d, z: p.z }) - sample({ x: p.x - d, z: p.z }),
    dz = sample({ x: p.x, z: p.z + d }) - sample({ x: p.x, z: p.z - d });
  return Math.atan2(-dz, -dx);
}
/** Evaluate the common planning surface in metres, including coastal, broad upland and water cuts.
 * This analytic 2D surface is not a compiled runtime heightmap or traversal certificate.
 * @param plan Resolved geometry and longitudinal water profiles.
 * @param p World X/Z location in metres.
 * @returns Ground elevation above the ocean reference plane.
 */
export function samplePlanningGround(plan: IslandPlan, p: PlanPoint): number {
  if (
    plan.settlementLayout ||
    plan.canyonStudy ||
    plan.landformStudy ||
    plan.authoredResources?.some(
      (resource) => isPlanningTerrainResource(resource) || resource.resourceType === "water-body"
    )
  )
    return createPlanningGroundSampler(plan)(p);
  const lands = [plan.land, ...plan.islands],
    land = lands.find((r) => pointInPolygon(p, r));
  const coast = land ? edgeDistance(p, land) : Math.min(...lands.map((r) => edgeDistance(p, r)));
  let broad = land ? 12 * smooth(coast / 100) : -4 * smooth(coast / 60);
  if (land && plan.parameters.globalElevation === undefined) {
    let uplift = 0;
    for (const mountain of plan.mountains) {
      if (mountain.landform) {
        uplift = Math.max(uplift, mountainUplift(mountain.landform, p));
        continue;
      }
      const rocks = plan.rocks.filter((r) => r.groupId === mountain.id);
      if (!rocks.length) continue;
      const center = {
        x: rocks.reduce((sum, r) => sum + r.center.x, 0) / rocks.length,
        z: rocks.reduce((sum, r) => sum + r.center.z, 0) / rocks.length
      };
      const radius = Math.max(
        80,
        ...rocks.map((r) => Math.hypot(r.center.x - center.x, r.center.z - center.z) + Math.max(r.width, r.depth))
      );
      const influence = Math.exp(-Math.pow(Math.hypot(p.x - center.x, p.z - center.z) / (radius * 1.5), 2));
      uplift = Math.max(uplift, Math.max(...rocks.map((r) => r.height)) * 0.045 * influence);
    }
    broad += (uplift + relief(plan.parameters.seed, p)) * smooth(coast / 100);
  }
  if (land && plan.parameters.globalElevation !== undefined)
    broad = globalPlanningElevation(plan, p) * smooth(coast / 100);
  let result = broad,
    waterInfluence = false;
  for (const water of plan.waters) {
    const surface = plan.planning?.profiles.find((v) => v.ownerId === water.id && v.kind === "water");
    const bed = plan.planning?.profiles.find((v) => v.ownerId === water.id && v.kind === "bed");
    if (!surface?.points.length || !bed?.points.length) continue;
    const inside = pointInPolygon(p, water.outline),
      edge = edgeDistance(p, water.outline);
    if (!inside && edge >= 24) continue;
    const level = profileHeight(p, surface),
      bottom = profileHeight(p, bed);
    // Both sides share the same boundary value. Cut unions use the lower bed, independent of order.
    const target = inside
      ? level - 0.05 + (bottom - level + 0.05) * smooth(edge / Math.max(2, surface.width * 0.35))
      : level - 0.05 + (broad - level + 0.05) * smooth(edge / 24);
    result = waterInfluence ? Math.min(result, target) : target;
    waterInfluence = true;
  }
  return result;
}
/** Ground owned objects against the final common surface, then refresh ground-bound shared ports.
 * @param plan Candidate snapshot; mutates only grounding heights and ground profiles.
 */
export function finalizePlanningTerrain(plan: IslandPlan): void {
  const sampleGround = createPlanningGroundSampler(plan);
  for (const rock of plan.rocks) {
    const base = sampleGround(rock.center),
      delta = base - (rock.baseHeight ?? 0);
    if (rock.boxes) for (const box of rock.boxes) box.elevation = (box.elevation ?? 0) + delta;
    rock.baseHeight = base;
  }
  for (const building of plan.buildings) building.baseHeight = sampleGround(building.center);
  const data = plan.planning;
  if (!data) return;
  for (const port of data.ports)
    if (port.kind !== "water" && port.kind !== "summit") {
      port.height = sampleGround(port.position);
      port.surfaceId = "ground-final";
    }
  const old = data.profiles.findIndex((p) => p.id === "ground-final");
  if (old >= 0) data.profiles.splice(old, 1);
  data.profiles.push({
    id: "ground-final",
    ownerId: "land-main",
    kind: "ground",
    points: [...plan.rocks.map((r) => r.center), ...plan.buildings.map((b) => b.center), plan.spawn].map((p) => ({
      ...p,
      y: sampleGround(p)
    })),
    width: 0,
    supportIds: ["land-main", ...plan.waters.map((w) => `${w.id}-bed`)]
  });
}

interface GroundEdge {
  x: number;
  z: number;
  dx: number;
  dz: number;
  length2: number;
  x0: number;
  x1: number;
  z0: number;
  z1: number;
}
type GroundBounds = readonly [number, number, number, number];
export type PlanningGroundSampler = ((p: PlanPoint) => number) & {
  /** Compile exact geometry candidates once for a batch. Queries outside it remain valid. */
  prepareBounds?(bounds: GroundBounds): void;
};
/** Prepared exact edges; the grid only rejects impossible distance/ray candidates. */
export function createPlanningRingQuery(ring: PlanPoint[]) {
  const size = 64,
    rowSize = 8,
    edges: GroundEdge[] = [],
    cells = new Map<string, number[]>(),
    rows = new Map<number, number[]>();
  let x0 = Infinity,
    x1 = -Infinity,
    z0 = Infinity,
    z1 = -Infinity;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i],
      b = ring[(i + 1) % ring.length],
      edge = {
        x: a.x,
        z: a.z,
        dx: b.x - a.x,
        dz: b.z - a.z,
        length2: (b.x - a.x) ** 2 + (b.z - a.z) ** 2,
        x0: Math.min(a.x, b.x),
        x1: Math.max(a.x, b.x),
        z0: Math.min(a.z, b.z),
        z1: Math.max(a.z, b.z)
      };
    x0 = Math.min(x0, edge.x0);
    x1 = Math.max(x1, edge.x1);
    z0 = Math.min(z0, edge.z0);
    z1 = Math.max(z1, edge.z1);
    edges.push(edge);
    for (let z = Math.floor((edge.z0 - 1e-7) / rowSize); z <= Math.floor((edge.z1 + 1e-7) / rowSize); z++) {
      const row = rows.get(z);
      if (row) row.push(i);
      else rows.set(z, [i]);
    }
    for (let z = Math.floor((edge.z0 - 1e-7) / size); z <= Math.floor((edge.z1 + 1e-7) / size); z++) {
      for (let x = Math.floor(edge.x0 / size); x <= Math.floor(edge.x1 / size); x++) {
        const key = `${x}:${z}`,
          cell = cells.get(key);
        if (cell) cell.push(i);
        else cells.set(key, [i]);
      }
    }
  }
  const distanceSquared = (p: PlanPoint, e: GroundEdge) => {
    const t = Math.max(0, Math.min(1, ((p.x - e.x) * e.dx + (p.z - e.z) * e.dz) / (e.length2 || 1))),
      dx = p.x - e.x - e.dx * t,
      dz = p.z - e.z - e.dz * t;
    return dx * dx + dz * dz;
  };
  const within = (p: PlanPoint, radius: number) =>
    p.x >= x0 - radius && p.x <= x1 + radius && p.z >= z0 - radius && p.z <= z1 + radius;
  type Node = { x0: number; x1: number; z0: number; z1: number; ids?: number[]; left?: Node; right?: Node };
  const tree = (ids: number[]): Node => {
    const node: Node = { x0: Infinity, x1: -Infinity, z0: Infinity, z1: -Infinity };
    for (const id of ids) {
      const edge = edges[id];
      node.x0 = Math.min(node.x0, edge.x0);
      node.x1 = Math.max(node.x1, edge.x1);
      node.z0 = Math.min(node.z0, edge.z0);
      node.z1 = Math.max(node.z1, edge.z1);
    }
    if (ids.length <= 8) {
      node.ids = ids;
      return node;
    }
    const alongX = node.x1 - node.x0 >= node.z1 - node.z0;
    ids.sort((a, b) =>
      alongX
        ? edges[a].x0 + edges[a].x1 - (edges[b].x0 + edges[b].x1)
        : edges[a].z0 + edges[a].z1 - (edges[b].z0 + edges[b].z1)
    );
    const mid = Math.floor(ids.length / 2);
    node.left = tree(ids.slice(0, mid));
    node.right = tree(ids.slice(mid));
    return node;
  };
  const root = tree(edges.map((_, i) => i));
  // Compile once into contiguous arrays. Query traversal reuses a stack and carries
  // child lower bounds, avoiding closures and repeated bounding-box tests per point.
  const flatNodes: Node[] = [];
  const flatten = (node: Node) => {
    const id = flatNodes.length;
    flatNodes.push(node);
    if (node.left) {
      flatten(node.left);
      flatten(node.right!);
    }
    return id;
  };
  flatten(root);
  const nodeIds = new Map(flatNodes.map((n, i) => [n, i]));
  const boxes = new Float64Array(flatNodes.length * 4),
    children = new Int32Array(flatNodes.length * 2).fill(-1);
  for (let i = 0; i < flatNodes.length; i++) {
    const n = flatNodes[i];
    boxes.set([n.x0, n.x1, n.z0, n.z1], i * 4);
    if (n.left) {
      children[i * 2] = nodeIds.get(n.left)!;
      children[i * 2 + 1] = nodeIds.get(n.right!)!;
    }
  }
  const stack = new Int32Array(flatNodes.length),
    boundsStack = new Float64Array(flatNodes.length);
  const lower = (x: number, z: number, id: number) => {
    const i = id * 4,
      dx = Math.max(boxes[i] - x, 0, x - boxes[i + 1]),
      dz = Math.max(boxes[i + 2] - z, 0, z - boxes[i + 3]);
    return dx * dx + dz * dz;
  };
  const distance = (p: PlanPoint, cap: number, out?: PlanPoint & { edge: number; t: number }) => {
    let best = cap * cap,
      top = 1,
      bestEdge = -1;
    stack[0] = 0;
    boundsStack[0] = lower(p.x, p.z, 0);
    while (top) {
      const slot = --top,
        id = stack[slot];
      if (boundsStack[slot] >= best) continue;
      const ids = flatNodes[id].ids;
      if (ids) {
        for (const edge of ids) {
          const d = distanceSquared(p, edges[edge]);
          if (d < best) {
            best = d;
            bestEdge = edge;
          }
        }
        continue;
      }
      const left = children[id * 2],
        right = children[id * 2 + 1],
        a = lower(p.x, p.z, left),
        b = lower(p.x, p.z, right);
      if (a <= b) {
        if (b < best) {
          stack[top] = right;
          boundsStack[top++] = b;
        }
        if (a < best) {
          stack[top] = left;
          boundsStack[top++] = a;
        }
      } else {
        if (a < best) {
          stack[top] = left;
          boundsStack[top++] = a;
        }
        if (b < best) {
          stack[top] = right;
          boundsStack[top++] = b;
        }
      }
    }
    if (out && bestEdge >= 0) {
      const e = edges[bestEdge],
        t = Math.max(0, Math.min(1, ((p.x - e.x) * e.dx + (p.z - e.z) * e.dz) / (e.length2 || 1)));
      out.x = e.x + e.dx * t;
      out.z = e.z + e.dz * t;
      out.edge = bestEdge;
      out.t = t;
    }
    return Math.sqrt(best);
  };
  // Compile repeated scanline projections once, without changing containment tolerance.
  let scanZ = NaN;
  const scanEdges: GroundEdge[] = [],
    scanCrossings: number[] = [];
  const inside = (p: PlanPoint) => {
    if (!within(p, 1e-7)) return false;
    if (p.z !== scanZ) {
      scanZ = p.z;
      scanEdges.length = 0;
      scanCrossings.length = 0;
      for (const id of rows.get(Math.floor(p.z / rowSize)) ?? []) {
        const e = edges[id];
        if (p.z < e.z0 - 1e-7 || p.z > e.z1 + 1e-7) continue;
        scanEdges.push(e);
        scanCrossings.push(e.z > p.z !== e.z + e.dz > p.z ? e.x + (e.dx * (p.z - e.z)) / e.dz : -Infinity);
      }
    }
    let result = false;
    for (let i = 0; i < scanEdges.length; i++) {
      const e = scanEdges[i];
      if (e.x1 < p.x - 1e-7) continue;
      if (p.x >= e.x0 - 1e-7 && p.x <= e.x1 + 1e-7 && distanceSquared(p, e) < 1e-14) return true;
      if (p.x < scanCrossings[i]) result = !result;
    }
    return result;
  };
  const stamps = new Uint32Array(edges.length);
  let stamp = 0;
  const visit = (x0: number, x1: number, z0: number, z1: number, test: (edge: GroundEdge) => boolean) => {
    stamp++;
    if (stamp === 4294967296) {
      stamps.fill(0);
      stamp = 1;
    }
    for (let z = Math.floor(z0 / size); z <= Math.floor(z1 / size); z++)
      for (let x = Math.floor(x0 / size); x <= Math.floor(x1 / size); x++)
        for (const id of cells.get(`${x}:${z}`) ?? []) {
          if (stamps[id] === stamp) continue;
          stamps[id] = stamp;
          const edge = edges[id];
          if (edge.x0 > x1 || edge.x1 < x0 || edge.z0 > z1 || edge.z1 < z0) continue;
          if (!test(edge)) return false;
        }
    return true;
  };
  const segmentNearEdge = (a: PlanPoint, b: PlanPoint, e: GroundEdge, radius2: number) => {
    const dx = b.x - a.x,
      dz = b.z - a.z,
      ax = e.x - a.x,
      az = e.z - a.z,
      bx = e.x + e.dx - a.x,
      bz = e.z + e.dz - a.z;
    if (
      (dx * az - dz * ax) * (dx * bz - dz * bx) < 0 &&
      (e.dx * -az - e.dz * -ax) * (e.dx * (b.z - e.z) - e.dz * (b.x - e.x)) < 0
    )
      return true;
    if (distanceSquared(a, e) <= radius2 || distanceSquared(b, e) <= radius2) return true;
    const length2 = dx * dx + dz * dz;
    for (const t0 of [0, 1]) {
      const ox = ax + e.dx * t0,
        oz = az + e.dz * t0,
        t = Math.max(0, Math.min(1, (ox * dx + oz * dz) / (length2 || 1))),
        px = ox - dx * t,
        pz = oz - dz * t;
      if (px * px + pz * pz <= radius2) return true;
    }
    return false;
  };
  const touchesSegment = (a: PlanPoint, b: PlanPoint, radius: number) => {
    if (
      !within(a, radius) &&
      !within(b, radius) &&
      (Math.max(a.x, b.x) + radius < x0 ||
        Math.min(a.x, b.x) - radius > x1 ||
        Math.max(a.z, b.z) + radius < z0 ||
        Math.min(a.z, b.z) - radius > z1)
    )
      return false;
    if (inside(a) || inside(b)) return true;
    return !visit(
      Math.min(a.x, b.x) - radius,
      Math.max(a.x, b.x) + radius,
      Math.min(a.z, b.z) - radius,
      Math.max(a.z, b.z) + radius,
      (edge) => !segmentNearEdge(a, b, edge, radius * radius)
    );
  };
  const containsSegment = (a: PlanPoint, b: PlanPoint, radius: number) =>
    inside(a) &&
    inside(b) &&
    visit(
      Math.min(a.x, b.x) - radius,
      Math.max(a.x, b.x) + radius,
      Math.min(a.z, b.z) - radius,
      Math.max(a.z, b.z) + radius,
      (edge) => !segmentNearEdge(a, b, edge, Math.max(0, radius * radius - 1e-12))
    );
  const containsPolygon = (polygon: PlanPoint[], epsilon = 0.01) =>
    polygon.every((p) => inside(p) || distance(p, epsilon + 1e-6) <= epsilon) &&
    polygon.every((a, i) => {
      const b = polygon[(i + 1) % polygon.length];
      return visit(
        Math.min(a.x, b.x),
        Math.max(a.x, b.x),
        Math.min(a.z, b.z),
        Math.max(a.z, b.z),
        (e) => !crosses(a, b, { x: e.x, z: e.z }, { x: e.x + e.dx, z: e.z + e.dz })
      );
    });
  const overlapsPolygon = (polygon: PlanPoint[]) => {
    let minX = Infinity,
      maxX = -Infinity,
      minZ = Infinity,
      maxZ = -Infinity;
    for (const p of polygon) {
      minX = Math.min(minX, p.x);
      maxX = Math.max(maxX, p.x);
      minZ = Math.min(minZ, p.z);
      maxZ = Math.max(maxZ, p.z);
    }
    // Most routing probes are far from this water/land polygon. Reject disjoint
    // bounds before walking either outline; retain the exact boundary tolerance.
    if (minX > x1 + 1e-7 || maxX < x0 - 1e-7 || minZ > z1 + 1e-7 || maxZ < z0 - 1e-7) return false;
    if (polygon.some(inside)) return true;
    if (
      !visit(
        minX - 1e-7,
        maxX + 1e-7,
        minZ - 1e-7,
        maxZ + 1e-7,
        (e) =>
          !pointInPolygon({ x: e.x, z: e.z }, polygon) && !pointInPolygon({ x: e.x + e.dx, z: e.z + e.dz }, polygon)
      )
    )
      return true;
    return polygon.some((a, i) => {
      const b = polygon[(i + 1) % polygon.length];
      return !visit(
        Math.min(a.x, b.x),
        Math.max(a.x, b.x),
        Math.min(a.z, b.z),
        Math.max(a.z, b.z),
        (e) => !crosses(a, b, { x: e.x, z: e.z }, { x: e.x + e.dx, z: e.z + e.dz })
      );
    });
  };
  // A raster tile asks thousands of nearby questions about the same outline. The
  // distance at its centre plus its radius bounds the nearest edge everywhere in
  // the tile (distance is 1-Lipschitz). Retain every edge that can attain that bound.
  // This is an exact candidate reduction, not a distance-field approximation.
  let prepared: GroundBounds | undefined,
    candidates: number[] = [],
    constantInside: boolean | undefined,
    minimumDistance = 0;
  const inPrepared = (p: PlanPoint) =>
    prepared !== undefined && p.x >= prepared[0] && p.z >= prepared[1] && p.x <= prepared[2] && p.z <= prepared[3];
  const prepareBounds = (bounds: GroundBounds) => {
    prepared = bounds;
    candidates = [];
    constantInside = undefined;
    const center = { x: (bounds[0] + bounds[2]) / 2, z: (bounds[1] + bounds[3]) / 2 };
    const radius = Math.hypot(bounds[2] - bounds[0], bounds[3] - bounds[1]) / 2;
    const centerDistance = distance(center, Infinity),
      reach = centerDistance + radius + 1e-7,
      limit = reach * reach;
    minimumDistance = Math.max(0, centerDistance - radius - 1e-7);
    let crossesBounds = false;
    for (let i = 0; i < edges.length; i++) {
      const e = edges[i],
        dx = Math.max(bounds[0] - e.x1, 0, e.x0 - bounds[2]),
        dz = Math.max(bounds[1] - e.z1, 0, e.z0 - bounds[3]);
      if (dx * dx + dz * dz <= limit) candidates.push(i);
      if (dx <= 1e-7 && dz <= 1e-7) crossesBounds = true;
    }
    if (!crossesBounds) constantInside = inside(center);
  };
  const preparedDistance = (p: PlanPoint, cap: number, out?: PlanPoint & { edge: number; t: number }) => {
    if (!inPrepared(p)) return distance(p, cap, out);
    if (cap * cap <= minimumDistance * minimumDistance) return Math.sqrt(cap * cap);
    let best = cap * cap,
      bestEdge = -1,
      tied = false;
    for (const id of candidates) {
      const d = distanceSquared(p, edges[id]);
      if (d < best) {
        best = d;
        bestEdge = id;
        tied = false;
      } else if (d === best) tied = true;
    }
    // Preserve the original BVH's contact choice at exact ties (profile attributes
    // can differ even when two outline edges have the same distance).
    if (out && tied) return distance(p, cap, out);
    if (out && bestEdge >= 0) {
      const e = edges[bestEdge],
        t = Math.max(0, Math.min(1, ((p.x - e.x) * e.dx + (p.z - e.z) * e.dz) / (e.length2 || 1)));
      out.x = e.x + e.dx * t;
      out.z = e.z + e.dz * t;
      out.edge = bestEdge;
      out.t = t;
    }
    return Math.sqrt(best);
  };
  return {
    inside: (p: PlanPoint) => (constantInside !== undefined && inPrepared(p) ? constantInside : inside(p)),
    distance: preparedDistance,
    nearest: (p: PlanPoint, out: PlanPoint & { edge: number; t: number }) => preparedDistance(p, Infinity, out),
    prepareBounds,
    within,
    touchesSegment,
    containsSegment,
    containsPolygon,
    overlapsPolygon
  };
}
/** Prepare an immutable surface-query snapshot. Geometry and capability resolution are
 * unchanged; consumers must create a new sampler after modifying terrain inputs.
 */
/** Natural banks are the immutable input to bridge placement; derived fill never feeds back into compilation. */
export function createPlanningGroundSampler(
  plan: IslandPlan,
  options: { natural?: boolean; excludeWaterBodyId?: string } = {}
): PlanningGroundSampler {
  if (plan.authoredWaterLayer === 1) {
    const isAuthored = (id: string) =>
      plan.waters.some((w) => w.id === id && w.systemId?.startsWith("agent-authored-"));
    const basePlan: IslandPlan = {
      ...plan,
      authoredWaterLayer: undefined,
      authoredResources: plan.authoredResources?.filter(
        (r) => r.resourceType !== "water-body" && r.resourceType !== "river"
      ),
      waters: plan.waters.filter((w) => !isAuthored(w.id)),
      planning: plan.planning && {
        ...plan.planning,
        profiles: plan.planning.profiles.filter((p) => !isAuthored(p.ownerId))
      }
    };
    const base = createPlanningGroundSampler(basePlan, { natural: options.natural });
    const preparations: ((bounds: GroundBounds) => void)[] = [(b) => base.prepareBounds?.(b)];
    const query = (ring: PlanPoint[]) => {
      const q = createPlanningRingQuery(ring);
      preparations.push(q.prepareBounds);
      return q;
    };
    const project = (points: PlanningProfile["points"]) => {
      const p = indexedProfileProjection(points);
      preparations.push(p.prepareBounds);
      return p;
    };
    const rivers = {
      ...basePlan,
      authoredResources: [],
      waters: plan.waters.filter((w) => w.systemId === "agent-authored-rivers"),
      planning: plan.planning
    };
    const riverGround = createPlanningNaturalGroundSampler(rivers, query, project, (p) => preparations.push(p), base);
    const ground = planningLakeGround(
      (plan.authoredResources ?? []).filter((r) => r.resourceId !== options.excludeWaterBodyId),
      riverGround
    );
    return Object.assign(ground, {
      prepareBounds: (bounds: GroundBounds) => {
        for (const prepare of preparations) prepare(bounds);
      }
    });
  }
  const preparations: ((bounds: GroundBounds) => void)[] = [];
  const query = (ring: PlanPoint[]) => {
    const q = createPlanningRingQuery(ring);
    preparations.push(q.prepareBounds);
    return q;
  };
  const project = (points: PlanningProfile["points"]) => {
    const p = indexedProfileProjection(points);
    preparations.push(p.prepareBounds);
    return p;
  };
  const prepared = (sample: (p: PlanPoint) => number): PlanningGroundSampler =>
    Object.assign(sample, {
      prepareBounds: (bounds: GroundBounds) => {
        for (const prepare of preparations) prepare(bounds);
      }
    });
  // Excluding one authored basin keeps its current carve out of a new level derivation.
  const authored = (plan.authoredResources ?? []).filter(
    (resource) =>
      !(
        options.excludeWaterBodyId &&
        resource.resourceType === "water-body" &&
        resource.resourceId === options.excludeWaterBodyId
      )
  );
  const natural = planningLakeGround(
    authored,
    createPlanningNaturalGroundSampler(plan, query, project, (prepare) => preparations.push(prepare))
  );
  if (options.natural || !plan.roadApproaches?.some((a) => a.approach?.grading)) return prepared(natural);
  const fill = bridgeApproachGradingSampler(plan.roadApproaches, natural);
  const waters = plan.waters.map((w) => ({ ring: query(w.outline), holes: (w.lake?.holes ?? []).map(query) }));
  return prepared((p) => {
    const original = natural(p),
      height = fill(p);
    if (height === undefined) return original;
    // Fill belongs only to dry land. Neither river nor lake beds can be lifted by an approach.
    if (waters.some((w) => w.ring.inside(p) && !w.holes.some((h) => h.inside(p)))) return original;
    return height;
  });
}

function createPlanningNaturalGroundSampler(
  plan: IslandPlan,
  query: typeof createPlanningRingQuery,
  project: typeof indexedProfileProjection,
  registerPreparation?: (prepare: (bounds: GroundBounds) => void) => void,
  baseGround?: (p: PlanPoint) => number
): (p: PlanPoint) => number {
  const reliefAt = createReliefSampler(plan.parameters.seed);
  const authored = plan.authoredResources?.some(isPlanningTerrainResource)
    ? authoredTerrainDisplacement(plan.authoredResources)
    : () => 0;
  const profileSamplers = new WeakMap<PlanningProfile, (p: PlanPoint) => number>();
  const profileHeight = (p: PlanPoint, profile: PlanningProfile) => indexedProfileSampler(profile, profileSamplers)(p);
  if (plan.villageStudy) return (p) => 12 + reliefAt(p) + authored(p);
  if (plan.settlementLayout || plan.canyonStudy || plan.landformStudy) {
    const lands = [plan.land, ...plan.islands].map(query);
    const waters = plan.waters.flatMap((w) => {
      const bed = plan.planning?.profiles.find((v) => v.ownerId === w.id && v.kind === "bed");
      if (!bed || w.lake?.carved === false) return [];
      const surface = plan.planning?.profiles.find((v) => v.ownerId === w.id && v.kind === "water"),
        widthProfile = w.widths
          ? { ...bed, points: bed.points.map((p, i) => ({ ...p, y: w.widths![i] ?? bed.width })) }
          : undefined,
        bankProfile = w.bankWidths?.some((v) => v !== w.bankWidths![0])
          ? { ...bed, points: bed.points.map((p, i) => ({ ...p, y: w.bankWidths![i] ?? w.bankWidthM ?? 12 })) }
          : undefined;
      // Bed, width and bank channels share XZ geometry. Surface profiles may be independently authored.
      const projectBed = project(bed.points);
      const alignedSurface =
        surface?.points.length === bed.points.length &&
        surface.points.every((p, i) => p.x === bed.points[i].x && p.z === bed.points[i].z);
      // Bind immutable samplers once; aligned channels reuse one exact nearest-segment projection.
      return [
        {
          outline: w.outline,
          shoreHeights: [] as number[],
          bankReach: 0,
          drops: w.course ? watercourseGeometry(w.course).drops : [],
          ring: query(w.outline),
          holes: (w.lake?.holes ?? []).map(query),
          surface,
          bed,
          lake: w.lake,
          bedAt: indexedProfileSampler(bed, profileSamplers, projectBed),
          surfaceAt: surface?.points.length
            ? indexedProfileSampler(surface, profileSamplers, alignedSurface ? projectBed : project(surface.points))
            : undefined,
          widthAt: widthProfile ? indexedProfileSampler(widthProfile, profileSamplers, projectBed) : undefined,
          bankAt: bankProfile ? indexedProfileSampler(bankProfile, profileSamplers, projectBed) : undefined,
          bankWidthM: w.bankWidthM,
          bankWidths: w.bankWidths,
          graded: gradeLimitedBed(bed.points, bed.width / 2, roadLimits.maxSlope * 0.85)
        }
      ];
    });
    const localDisplacement = reliefField(plan.parameters.terrainPatches ?? []),
      globalDisplacement = worldElevationField(
        plan.parameters.worldElevation,
        plan.parameters.width,
        plan.parameters.depth
      );
    const regionalDisplacement = poiRegionElevationSampler(plan),
      hasBroadRelief =
        !!plan.parameters.worldElevation?.riseM ||
        !!plan.regionFields?.elevation?.cells.some((cell) => cell.value !== 0);
    const displacement = (p: PlanPoint) => localDisplacement(p) + globalDisplacement(p) + regionalDisplacement(p);
    const coastShoulder = 100,
      bankShoulder = 8 + (plan.parameters.worldElevation?.riseM ?? 0) * 5;
    const gradeBudget = roadLimits.maxSlope * 0.85;
    const rawBase = (p: PlanPoint) => {
      let land: (typeof lands)[number] | undefined;
      for (const candidate of lands)
        if (candidate.inside(p)) {
          land = candidate;
          break;
        }
      if (!land) {
        let coast = 60;
        for (const r of lands) coast = Math.min(coast, r.distance(p, coast));
        return -4 * smooth(coast / 60);
      }
      const desired = 12 + reliefAt(p) + displacement(p);
      if (!hasBroadRelief) return desired * smooth(land.distance(p, coastShoulder) / coastShoulder);
      // Bound the coastal grade rather than attenuating the whole island as height increases.
      return Math.min(desired, land.distance(p, Math.max(100, desired / gradeBudget + 1)) * gradeBudget);
    };
    const raw = (p: PlanPoint) => (baseGround ? baseGround(p) : rawBase(p) + authored(p));
    for (const w of waters) {
      w.shoreHeights = w.outline.map(raw);
      const top = w.shoreHeights.reduce((a, b) => Math.max(a, b), -Infinity),
        level = (w.surface?.points ?? w.bed.points).reduce((a, p) => Math.min(a, p.y), Infinity);
      const width = (w.bankWidths ?? []).reduce((a, b) => Math.max(a, b), w.bankWidthM ?? bankShoulder);
      w.bankReach = riverBankReach(width, top - level);
    }
    let batchBounds: GroundBounds | undefined,
      batchWaters = waters;
    registerPreparation?.((bounds) => {
      batchBounds = bounds;
      const center = { x: (bounds[0] + bounds[2]) / 2, z: (bounds[1] + bounds[3]) / 2 },
        radius = Math.hypot(bounds[2] - bounds[0], bounds[3] - bounds[1]) / 2;
      // Exclude only water envelopes that cannot touch this batch. Unbounded grade
      // envelopes and probes outside the prepared bounds retain the full evaluator.
      batchWaters = waters.filter(
        (w) =>
          (hasBroadRelief && w.bankWidthM === undefined) ||
          w.ring.within(center, radius + (w.lake ? (w.bankWidthM ?? bankShoulder) : w.bankReach))
      );
    });
    const watersAt = (p: PlanPoint) =>
      batchBounds && p.x >= batchBounds[0] && p.z >= batchBounds[1] && p.x <= batchBounds[2] && p.z <= batchBounds[3]
        ? batchWaters
        : waters;
    const shoreContact = { x: 0, z: 0, edge: 0, t: 0 };
    const bankBlend = (v: number) => {
      const t = Math.max(0, Math.min(1, v));
      return t * (2 - t);
    };
    // Canyon water cuts follow its published bed profile and blend into surrounding terrain.
    const carved = (p: PlanPoint) => {
      const original = raw(p);
      let height = original;
      water: for (const w of watersAt(p)) {
        if (hasBroadRelief && w.bankWidthM === undefined) {
          height = w.graded(p, height);
          continue;
        }
        if (!w.ring.within(p, w.lake ? (w.bankWidthM ?? bankShoulder) : w.bankReach)) continue;
        const shoulder = w.bankAt ? w.bankAt(p) : (w.bankWidthM ?? bankShoulder);
        if (!w.ring.within(p, w.lake ? shoulder : w.bankReach)) continue;
        for (const hole of w.holes) if (hole.inside(p)) continue water;
        const inside = w.ring.inside(p);
        let edge = w.ring.nearest(p, shoreContact);
        for (const hole of w.holes) edge = Math.min(edge, hole.distance(p, Infinity));
        // Reject distant points using the actual shoreline distance before querying
        // water/bed profiles. The rectangle above is only a conservative broad phase.
        if (!inside && edge >= (w.lake ? shoulder : w.bankReach)) continue;
        // Terrain owns the cliff. The falling curtain travels out from its lip; carving a
        // matching diagonal wedge would intersect the curtain after height-grid interpolation.
        let drop: (typeof w.drops)[number] | undefined;
        for (const d of w.drops) {
          const dx = d.lower[0] - d.upper[0],
            dz = d.lower[2] - d.upper[2],
            den = dx * dx + dz * dz;
          const t = ((p.x - d.upper[0]) * dx + (p.z - d.upper[2]) * dz) / den;
          const side = Math.abs((p.x - d.upper[0]) * d.across[0] + (p.z - d.upper[2]) * d.across[1]);
          if (t >= 0 && t <= 1 && side <= d.width / 2 + shoulder) {
            drop = d;
            break;
          }
        }
        const dropDepth =
          drop && w.surfaceAt
            ? w.surfaceAt({ x: drop.lower[0], z: drop.lower[2] }) - w.bedAt({ x: drop.lower[0], z: drop.lower[2] })
            : 0;
        const bottom = drop ? drop.lower[1] - dropDepth : w.bedAt(p);
        if (w.bankWidthM !== undefined && w.surfaceAt) {
          // The authored boundary crosses the water datum. A finite bank slope avoids
          // amplifying R16 height quantization into a wide wet/dry boundary error.
          const shoreline = w.lake ? w.lake.referenceLevel : drop ? drop.lower[1] : Math.max(bottom, w.surfaceAt(p));
          if (!w.lake && !drop) {
            const shoreGround =
              w.shoreHeights[shoreContact.edge] * (1 - shoreContact.t) +
              w.shoreHeights[(shoreContact.edge + 1) % w.shoreHeights.length] * shoreContact.t;
            height = Math.min(
              height,
              planningRiverBankHeight({
                natural: original,
                shoreline,
                bed: bottom,
                shoreGround,
                distance: edge,
                inside,
                widthM: w.widthAt ? w.widthAt(p) : w.bed.width,
                bankWidthM: shoulder
              })
            );
            continue;
          }
          const target = inside
            ? shoreline +
              (bottom - shoreline) * bankBlend(edge / Math.max(0.1, (w.widthAt ? w.widthAt(p) : w.bed.width) * 0.35))
            : shoreline + (original - shoreline) * bankBlend(edge / Math.max(0.01, shoulder));
          height = Math.min(height, target);
        } else {
          const weight = inside ? 1 : 1 - smooth(edge / shoulder);
          height = Math.min(height, original * (1 - weight) + bottom * weight);
        }
      }
      return height;
    };
    // Foundations resolve on the carved terrain, then blend back outside their footprint.
    const pads =
      !plan.spatialLayout && (plan.parameters.terrainPatches?.length || hasBroadRelief)
        ? plan.buildings.map((b) => ({ b, c: Math.cos(b.yaw), s: Math.sin(b.yaw), height: carved(b.center) }))
        : [];
    if (!pads.length) return carved;
    if (hasBroadRelief) {
      // A group's level must leave enough coastal distance for every footprint, not just its centre.
      // Otherwise the foundation's lower grade envelope can lift the seabed after raw() clipped the coast.
      const coastalLimits = new Map<string, number>();
      for (const pad of pads) {
        const land = lands.find((land) => land.inside(pad.b.center));
        const clearance = land
          ? Math.max(0, land.distance(pad.b.center, Infinity) - Math.hypot(pad.b.width, pad.b.depth) / 2)
          : 0;
        const id = pad.b.regionId ?? pad.b.id;
        coastalLimits.set(id, Math.min(coastalLimits.get(id) ?? Infinity, clearance * gradeBudget));
      }
      for (const pad of pads) pad.height = Math.min(pad.height, coastalLimits.get(pad.b.regionId ?? pad.b.id)!);
      fitFoundationLevels(pads, gradeBudget);
      // A bounded-grade envelope around actual foundations gives continuous grading without POI discs.
      return (p) => {
        let lower = -Infinity,
          upper = Infinity;
        for (const pad of pads) {
          const dx = p.x - pad.b.center.x,
            dz = p.z - pad.b.center.z;
          const distance = Math.hypot(
            Math.max(0, Math.abs(dx * pad.c + dz * pad.s) - pad.b.width / 2),
            Math.max(0, Math.abs(-dx * pad.s + dz * pad.c) - pad.b.depth / 2)
          );
          lower = Math.max(lower, pad.height - gradeBudget * distance);
          upper = Math.min(upper, pad.height + gradeBudget * distance);
        }
        return Math.max(lower, Math.min(upper, carved(p)));
      };
    }
    return (p) => {
      let height = carved(p),
        weight = 0,
        target = 0;
      for (const pad of pads) {
        const dx = p.x - pad.b.center.x,
          dz = p.z - pad.b.center.z;
        const edge = Math.max(
          Math.abs(dx * pad.c + dz * pad.s) - pad.b.width / 2,
          Math.abs(-dx * pad.s + dz * pad.c) - pad.b.depth / 2
        );
        const w = 1 - smooth(edge / 6);
        weight += w;
        target += w * pad.height;
      }
      if (weight > 0) height = height * (1 - Math.min(1, weight)) + (target / weight) * Math.min(1, weight);
      return height;
    };
  }
  const elevation = createPlanningElevationSampler(plan);
  const ridges = plan.mountains.flatMap((m) => (m.landform ? [m.landform] : []));
  const lands = [plan.land, ...plan.islands].map(createPlanningRingQuery),
    hills = plan.mountains.flatMap((mountain) => {
      if (mountain.landform) return [];
      const rocks = plan.rocks.filter((rock) => rock.groupId === mountain.id);
      if (!rocks.length) return [];
      const center = {
        x: rocks.reduce((sum, rock) => sum + rock.center.x, 0) / rocks.length,
        z: rocks.reduce((sum, rock) => sum + rock.center.z, 0) / rocks.length
      };
      const radius = Math.max(
        80,
        ...rocks.map(
          (rock) => Math.hypot(rock.center.x - center.x, rock.center.z - center.z) + Math.max(rock.width, rock.depth)
        )
      );
      return [{ center, radius: radius * 1.5, height: Math.max(...rocks.map((rock) => rock.height)) * 0.045 }];
    }),
    waters = plan.waters.flatMap((water) => {
      const surface = plan.planning?.profiles.find(
          (profile) => profile.ownerId === water.id && profile.kind === "water"
        ),
        bed = plan.planning?.profiles.find((profile) => profile.ownerId === water.id && profile.kind === "bed");
      return surface?.points.length && bed?.points.length
        ? [{ ring: createPlanningRingQuery(water.outline), surface, bed }]
        : [];
    });
  return (p) => {
    const land = lands.find((ring) => ring.inside(p)),
      coast = land ? land.distance(p, 100) : Math.min(...lands.map((ring) => ring.distance(p, 60)));
    let broad = land ? 12 * smooth(coast / 100) : -4 * smooth(coast / 60);
    if (land && plan.parameters.globalElevation === undefined) {
      let uplift = 0;
      for (const ridge of ridges) uplift = Math.max(uplift, mountainUplift(ridge, p));
      for (const hill of hills) {
        const influence = Math.exp(-Math.pow(Math.hypot(p.x - hill.center.x, p.z - hill.center.z) / hill.radius, 2));
        uplift = Math.max(uplift, hill.height * influence);
      }
      broad += (uplift + reliefAt(p)) * smooth(coast / 100);
    }
    if (land && plan.parameters.globalElevation !== undefined) broad = elevation(p) * smooth(coast / 100);
    broad += authored(p);
    let result = broad,
      waterInfluence = false;
    for (const water of waters) {
      if (!water.ring.within(p, 24)) continue;
      const inside = water.ring.inside(p),
        edge = water.ring.distance(p, inside ? Math.max(24, water.surface.width * 0.35) : 24);
      if (!inside && edge >= 24) continue;
      const level = profileHeight(p, water.surface),
        bottom = profileHeight(p, water.bed),
        target = inside
          ? level - 0.05 + (bottom - level + 0.05) * smooth(edge / Math.max(2, water.surface.width * 0.35))
          : level - 0.05 + (broad - level + 0.05) * smooth(edge / 24);
      result = waterInfluence ? Math.min(result, target) : target;
      waterInfluence = true;
    }
    return result;
  };
}

/** Continuous longitudinal ridge relief with smooth lateral shoulders and finite influence.
 * The same field is used by all terrain samplers and physical route checks.
 */
function mountainUplift(landform: NonNullable<IslandPlan["mountains"][number]["landform"]>, p: PlanPoint): number {
  let height = 0;
  for (let j = 1; j < landform.ridge.length; j++) {
    const a = landform.ridge[j - 1],
      b = landform.ridge[j],
      t = projection(p, a, b),
      distance = Math.hypot(p.x - a.x - (b.x - a.x) * t, p.z - a.z - (b.z - a.z) * t);
    height = Math.max(height, (a.height + (b.height - a.height) * t) * smooth(1 - distance / (landform.width * 0.5)));
  }
  return height;
}

/** Water rendering follows the same published downhill profile used to cut its bed. */
export function planningWaterHeight(plan: IslandPlan, id: string, p: PlanPoint): number | undefined {
  const profile = plan.planning?.profiles.find((q) => q.ownerId === id && q.kind === "water");
  return profile?.points.length ? profileHeight(p, profile) : undefined;
}
/** Prepare exact water-profile interpolation once for repeated candidate queries. */
export function createPlanningWaterHeightSampler(plan: IslandPlan, id: string): (p: PlanPoint) => number | undefined {
  const profile = plan.planning?.profiles.find((q) => q.ownerId === id && q.kind === "water");
  return profile?.points.length ? indexedProfileSampler(profile, new WeakMap()) : () => undefined;
}
