import { PLANNING_REFERENCE } from "../planning-data/PlanningReference";
import { findVillageAreaPath } from "./WorldLayoutPlaces";
import { ribbonOutline } from "./WorldRibbon";
import type { IslandPlan, PlanPoint } from "./IslandPlanModel";
import { createPlanningGroundSampler, createPlanningRingQuery } from "./WorldPlanningTerrain";
import { unionRectangles } from "./ComposedShape";
import type { ShapeRecipe } from "./ComposedShape";
import { routeIntersectsRock } from "./IslandPlanAtoms";

function inside(p: PlanPoint, polygon: PlanPoint[]): boolean {
  let result = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i],
      b = polygon[j];
    if (a.z > p.z !== b.z > p.z && p.x < ((b.x - a.x) * (p.z - a.z)) / (b.z - a.z) + a.x) result = !result;
  }
  return result;
}
const distance = (a: PlanPoint, b: PlanPoint) => Math.hypot(a.x - b.x, a.z - b.z);
const interpolate = (a: PlanPoint, b: PlanPoint, t: number): PlanPoint => ({
  x: a.x + (b.x - a.x) * t,
  z: a.z + (b.z - a.z) * t
});

/** Builds bounded, obstacle-tested planning paths and explicit crossing endpoints. */
export function buildWorldRoutes(
  plan: IslandPlan,
  options: {
    roadWidth: number;
    loopiness: number;
    climb: number;
    visibility: number;
    climbTargets?: string[];
    roadWidthVariation?: number;
    roadContourDetail?: number;
    crossingDetourRatio?: number;
  }
): string[] {
  if (plan.planning) return buildPlanningRoutes(plan, options);
  const notes: string[] = [];
  const width = options.roadWidth;
  const waterAt = (p: PlanPoint) => plan.waters.find((w) => inside(p, w.outline));
  const buildings = plan.buildings.map((b) => ({
    ...b,
    groupId: b.regionId,
    role: "terrace" as const,
    obb: b.outline
  }));
  const buildingBlocked = (a: PlanPoint, b: PlanPoint) =>
    buildings.some((building) => routeIntersectsRock(a, b, building, width / 2 + 2));
  const valid = (a: PlanPoint, b: PlanPoint): boolean => {
    if (buildingBlocked(a, b)) return false;
    if (plan.rocks.some((r) => routeIntersectsRock(a, b, r, width / 2 + 2))) return false;
    const n = Math.max(1, Math.ceil(distance(a, b) / 8));
    for (let i = 0; i <= n; i++) {
      const p = interpolate(a, b, i / n);
      if (!inside(p, plan.land)) return false;
    }
    return true;
  };
  // Grid search is a fallback, bounded by the number of cells in the planning domain.
  const findPath = (a: PlanPoint, b: PlanPoint): PlanPoint[] | undefined => {
    if (valid(a, b)) return [a, b];
    const step = 32,
      side = Math.floor(plan.parameters.width / step) + 1;
    const point = (id: number): PlanPoint => ({ x: (id % side) * step, z: Math.floor(id / side) * step });
    const key = (p: PlanPoint) => Math.round(p.z / step) * side + Math.round(p.x / step);
    const start = key(a),
      target = key(b),
      total = side * side;
    if (!valid(a, point(start)) || !valid(point(target), b)) return undefined;
    const cost = new Float64Array(total).fill(Infinity),
      parent = new Int32Array(total).fill(-1);
    const open = new Set<number>([start]),
      closed = new Uint8Array(total);
    cost[start] = 0;
    while (open.size) {
      let current = -1,
        best = Infinity;
      for (const id of open) {
        const score = cost[id] + distance(point(id), point(target));
        if (score < best) {
          best = score;
          current = id;
        }
      }
      if (current === target) {
        const path: PlanPoint[] = [b];
        let id = target;
        while (id !== start) {
          path.push(point(id));
          id = parent[id];
        }
        path.push(point(start), a);
        path.reverse();
        const simple: PlanPoint[] = [a];
        let index = 0;
        while (index < path.length - 1) {
          let next = path.length - 1;
          while (next > index + 1 && !valid(path[index], path[next])) next--;
          simple.push(path[next]);
          index = next;
        }
        return simple;
      }
      open.delete(current);
      closed[current] = 1;
      const p = point(current),
        x = current % side,
        z = Math.floor(current / side);
      for (let dz = -1; dz <= 1; dz++)
        for (let dx = -1; dx <= 1; dx++) {
          if ((!dx && !dz) || x + dx < 0 || x + dx >= side || z + dz < 0 || z + dz >= side) continue;
          const next = (z + dz) * side + x + dx,
            q = point(next);
          if (closed[next] || !valid(p, q)) continue;
          const candidate = cost[current] + distance(p, q) * (waterAt(q) ? 3 : 1);
          if (candidate < cost[next]) {
            cost[next] = candidate;
            parent[next] = current;
            open.add(next);
          }
        }
    }
    return undefined;
  };
  const add = (id: string, from: string, to: string, a: PlanPoint, b: PlanPoint): boolean => {
    const points = findPath(a, b);
    if (!points) {
      notes.push(`${id}：没有找到避让岩石且位于陆地内的通路`);
      return false;
    }
    plan.routes.push({ id, label: "地面通路", from, to, kind: "main", points, width });
    // Adjacent water bodies form one crossing; both endpoints are on dry land.
    let entry: PlanPoint | undefined,
      riverId = "",
      previous = points[0],
      crossing = 0;
    for (let segment = 1; segment < points.length; segment++) {
      const a = points[segment - 1],
        b = points[segment],
        n = Math.max(1, Math.ceil(distance(a, b) / 4));
      for (let i = 1; i <= n; i++) {
        const p = interpolate(a, b, i / n),
          water = waterAt(p);
        if (water && !entry) {
          entry = previous;
          riverId = water.id;
        }
        if (!water && entry) {
          plan.bridges.push({ id: `${id}-crossing-${crossing++}`, label: "跨越连接", a: entry, b: p, width, riverId });
          entry = undefined;
        }
        previous = p;
      }
    }
    if (entry) notes.push(`${id}：终点位于水域，需要场所调整`);
    return true;
  };
  const villages: { id: string; center: PlanPoint }[] = [];
  for (const region of plan.regions.filter((r) => r.kind === "village")) {
    const anchor = plan.shapeRecipes?.find((r) => r.id === region.id)?.blocks[0];
    const center = anchor
      ? { x: anchor.x, z: anchor.z }
      : {
          x: region.outline.reduce((s, p) => s + p.x, 0) / region.outline.length,
          z: region.outline.reduce((s, p) => s + p.z, 0) / region.outline.length
        };
    // Prefer the boundary facing spawn: this is the corridor reserved by the site module.
    const base = Math.atan2(plan.spawn.z - center.z, plan.spawn.x - center.x);
    let entrance: PlanPoint | undefined;
    for (const turn of [0, 0.25, -0.25, 0.5, -0.5, 1, -1, Math.PI]) {
      const angle = base + turn;
      const at = (radius: number): PlanPoint => ({
        x: center.x + Math.cos(angle) * radius,
        z: center.z + Math.sin(angle) * radius
      });
      let outer = 4;
      while (outer < 2048 && inside(at(outer), region.outline)) outer += 4;
      if (outer >= 2048) continue;
      let lo = outer - 4,
        hi = outer;
      for (let j = 0; j < 12; j++) {
        const mid = (lo + hi) / 2;
        if (inside(at(mid), region.outline)) lo = mid;
        else hi = mid;
      }
      const candidate = at(hi);
      if (waterAt(candidate) || !valid(candidate, candidate) || !findPath(plan.spawn, candidate)) continue;
      entrance = candidate;
      break;
    }
    if (!entrance) {
      notes.push(`${region.id}：没有找到可达且避让建筑的边界入口`);
      continue;
    }
    villages.push({ id: region.id, center: entrance });
    plan.places.push({
      id: `${region.id}-entrance`,
      label: "村落入口",
      purpose: "场所边界通行入口",
      center: entrance,
      outline: []
    });
  }
  // Grow a spatial tree: each new place connects to a nearby connected place,
  // rather than imposing a radial layout around spawn.
  const connected = [{ id: "spawn", center: plan.spawn }],
    pending = [...villages];
  const treeEdges = new Set<string>();
  const edgeKey = (a: string, b: string) => [a, b].sort().join("|");
  while (pending.length) {
    const candidates = pending
      .flatMap((target, index) =>
        connected.map((source) => ({ target, index, source, distance: distance(source.center, target.center) }))
      )
      .sort((a, b) => a.distance - b.distance);
    let linked = false;
    for (const { target, index, source } of candidates) {
      const targetId = `${target.id}-entrance`;
      if (!findPath(source.center, target.center)) continue;
      if (add(`route-${target.id}`, source.id, targetId, source.center, target.center)) {
        connected.push({ id: targetId, center: target.center });
        pending.splice(index, 1);
        treeEdges.add(edgeKey(source.id, targetId));
        linked = true;
        break;
      }
    }
    if (!linked) {
      notes.push("部分场所未找到接入现有通行网络的路径");
      break;
    }
  }
  const loopCount = Math.min(Math.max(0, villages.length - 1), Math.round(options.loopiness * (villages.length - 1)));
  const loopCandidates = connected
    .flatMap((a, i) =>
      connected
        .slice(i + 1)
        .filter((b) => !treeEdges.has(edgeKey(a.id, b.id)))
        .map((b) => ({ a, b, length: distance(a.center, b.center) }))
    )
    .sort((a, b) => a.length - b.length);
  let loops = 0;
  for (const { a, b } of loopCandidates) {
    if (loops >= loopCount) break;
    if (add(`route-loop-${loops}`, a.id, b.id, a.center, b.center)) loops++;
  }
  const shoulders = plan.rocks
    .filter((r) => r.role === "shoulder" || r.role === "terrace")
    .sort((a, b) => distance(a.center, plan.spawn) - distance(b.center, plan.spawn));
  const climbs = Math.min(shoulders.length, Math.ceil(options.climb * 3));
  for (let i = 0; i < climbs; i++) {
    const rock = shoulders[i];
    let made = false;
    for (let direction = 0; direction < 8 && !made; direction++) {
      const angle = (direction * Math.PI) / 4,
        radius = Math.hypot(rock.width, rock.depth) / 2 + Math.max(24, rock.height * 1.5);
      const foot = { x: rock.center.x + Math.cos(angle) * radius, z: rock.center.z + Math.sin(angle) * radius };
      if (
        !inside(foot, plan.land) ||
        waterAt(foot) ||
        buildingBlocked(foot, rock.center) ||
        plan.rocks.some((other) => other !== rock && routeIntersectsRock(foot, rock.center, other, width / 2 + 2))
      )
        continue;
      const steps = Math.ceil(distance(foot, rock.center) / 8);
      if (
        Array.from({ length: steps + 1 }, (_, j) => interpolate(foot, rock.center, j / steps)).some(
          (p) => !inside(p, plan.land) || waterAt(p)
        )
      )
        continue;
      const approach = findPath(plan.spawn, foot);
      if (!approach) continue;
      const id = `route-climb-${rock.id}`;
      if (!add(`${id}-approach`, "spawn", `${rock.id}-foot`, plan.spawn, foot)) continue;
      plan.routes.push({
        id,
        label: "山肩登高规划",
        from: `${rock.id}-foot`,
        to: rock.id,
        kind: "ridge",
        points: [foot, rock.center],
        width
      });
      const length = distance(foot, rock.center),
        nx = ((-(rock.center.z - foot.z) / length) * width) / 2,
        nz = (((rock.center.x - foot.x) / length) * width) / 2;
      const offset = (p: PlanPoint, sign: number): PlanPoint => ({ x: p.x + nx * sign, z: p.z + nz * sign });
      plan.supports.push({
        id: `support-${rock.id}`,
        routeId: id,
        a: foot,
        b: rock.center,
        startHeight: 0,
        endHeight: rock.height,
        width,
        thickness: 4,
        outline: [offset(foot, 1), offset(rock.center, 1), offset(rock.center, -1), offset(foot, -1)]
      });
      made = true;
    }
    if (!made) notes.push(`${rock.id}：没有找到不穿过其他岩体的登高坡面位置`);
  }
  if (climbs) notes.push("登高支撑为端点高度及占地规划，尚未验证真实坡面和角色通行");
  if (options.visibility > 0) {
    const targets = plan.rocks
      .filter((r) => r.role === "peak")
      .sort((a, b) => distance(a.center, plan.spawn) - distance(b.center, plan.spawn));
    for (const rock of targets.slice(0, Math.max(1, Math.round(options.visibility * 3))))
      plan.sights.push({
        id: `sight-${rock.id}`,
        from: plan.spawn,
        to: rock.center,
        spread: 18,
        label: "目标观察意图（未验证遮挡）"
      });
  }
  return notes;
}

/** Closed rectangular swept footprint of a planning segment. */
export function planningCorridor(a: PlanPoint, b: PlanPoint, width: number): PlanPoint[] {
  const l = distance(a, b) || 1,
    nx = ((-(b.z - a.z) / l) * width) / 2,
    nz = (((b.x - a.x) / l) * width) / 2;
  return [
    { x: a.x + nx, z: a.z + nz },
    { x: b.x + nx, z: b.z + nz },
    { x: b.x - nx, z: b.z - nz },
    { x: a.x - nx, z: a.z - nz }
  ];
}
function pointSegmentDistance(p: PlanPoint, a: PlanPoint, b: PlanPoint): number {
  const dx = b.x - a.x,
    dz = b.z - a.z,
    t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / (dx * dx + dz * dz || 1)));
  return distance(p, { x: a.x + t * dx, z: a.z + t * dz });
}
function segmentDistance(a: PlanPoint, b: PlanPoint, c: PlanPoint, d: PlanPoint): number {
  const cross = (p: PlanPoint, q: PlanPoint, r: PlanPoint) => (q.x - p.x) * (r.z - p.z) - (q.z - p.z) * (r.x - p.x);
  if (cross(a, b, c) * cross(a, b, d) < 0 && cross(c, d, a) * cross(c, d, b) < 0) return 0;
  return Math.min(
    pointSegmentDistance(a, c, d),
    pointSegmentDistance(b, c, d),
    pointSegmentDistance(c, a, b),
    pointSegmentDistance(d, a, b)
  );
}
/** Tests the complete segment capsule, including concave boundary crossings and narrow inlets. */
export function planningSegmentInside(a: PlanPoint, b: PlanPoint, ring: PlanPoint[], radius: number): boolean {
  const x0 = Math.min(a.x, b.x) - radius,
    x1 = Math.max(a.x, b.x) + radius,
    z0 = Math.min(a.z, b.z) - radius,
    z1 = Math.max(a.z, b.z) + radius;
  return (
    inside(a, ring) &&
    inside(b, ring) &&
    ring.every((p, i) => {
      const q = ring[(i + 1) % ring.length];
      return (
        Math.max(p.x, q.x) < x0 ||
        Math.min(p.x, q.x) > x1 ||
        Math.max(p.z, q.z) < z0 ||
        Math.min(p.z, q.z) > z1 ||
        segmentDistance(a, b, p, q) >= radius
      );
    })
  );
}
function segmentTouchesRing(a: PlanPoint, b: PlanPoint, ring: PlanPoint[], radius: number): boolean {
  const x0 = Math.min(a.x, b.x) - radius,
    x1 = Math.max(a.x, b.x) + radius,
    z0 = Math.min(a.z, b.z) - radius,
    z1 = Math.max(a.z, b.z) + radius;
  return (
    inside(a, ring) ||
    inside(b, ring) ||
    ring.some((p, i) => {
      const q = ring[(i + 1) % ring.length];
      return (
        Math.max(p.x, q.x) >= x0 &&
        Math.min(p.x, q.x) <= x1 &&
        Math.max(p.z, q.z) >= z0 &&
        Math.min(p.z, q.z) <= z1 &&
        segmentDistance(a, b, p, q) <= radius
      );
    })
  );
}

/** Stable low-frequency component widths with a length-weighted mean equal to
 * the requested width. Both endpoint components keep that mean for shared mouths.
 * @param mean Requested mean width in metres.
 * @param variation Relative width contrast in [0,1].
 * @param lengths Component centreline lengths.
 * @param seed World random seed.
 * @param id Stable route identity.
 * @returns Component widths bounded by minimum traversal clearance.
 */
export function planningRoadComponentWidths(
  mean: number,
  variation: number,
  lengths: readonly number[],
  seed: number,
  id: string
): number[] {
  const amount = Math.max(0, Math.min(1, variation));
  if (!amount || lengths.length < 4) return lengths.map(() => mean);
  const total = lengths.reduce((sum, length) => sum + length, 0) || 1;
  const random = (anchor: number) => {
    let h = seed | 0;
    const key = `${id}:width:${anchor}`;
    for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 16777619);
    h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
    return (((h ^ (h >>> 16)) >>> 0) / 4294967295) * 2 - 1;
  };
  let travel = 0;
  const samples = lengths.map((length, i) => {
    const at = travel + length / 2;
    travel += length;
    const x = at / 96,
      index = Math.floor(x),
      u = x - index,
      t = u * u * (3 - 2 * u),
      noise = random(index) + (random(index + 1) - random(index)) * t,
      fade = i === 0 || i === lengths.length - 1 ? 0 : Math.sin((Math.PI * at) / total) ** 2;
    return { noise, fade, length };
  });
  const weight = samples.reduce((sum, p) => sum + p.fade * p.length, 0),
    bias = weight ? samples.reduce((sum, p) => sum + p.fade * p.noise * p.length, 0) / weight : 0;
  const deviations = samples.map((p) => p.fade * (p.noise - bias)),
    maximum = Math.max(1e-9, ...deviations.map(Math.abs));
  const amplitude = Math.max(0, Math.min(mean * 0.5, mean - PLANNING_TRAVERSAL.minWidth));
  return deviations.map((value) => mean + (amplitude * amount * value) / maximum);
}
/** Provisional 2D planning capability; must be checked against runtime capabilities later. */
export const PLANNING_TRAVERSAL = PLANNING_REFERENCE.traversal;
function buildPlanningRoutes(
  plan: IslandPlan,
  options: {
    roadWidth: number;
    loopiness: number;
    climb: number;
    visibility: number;
    climbTargets?: string[];
    roadWidthVariation?: number;
    roadContourDetail?: number;
    crossingDetourRatio?: number;
  }
): string[] {
  const data = plan.planning!,
    notes: string[] = [],
    variation = Math.max(0, Math.min(1, options.roadWidthVariation ?? 0.5)),
    width =
      (options.roadWidth +
        Math.max(0, Math.min(options.roadWidth * 0.5, options.roadWidth - PLANNING_TRAVERSAL.minWidth)) * variation) *
        1.18 +
      options.roadWidth * 0.24,
    sampleGround = createPlanningGroundSampler(plan);
  if (variation > 0 && options.roadWidth < PLANNING_TRAVERSAL.minWidth * 2)
    notes.push("道路最小净宽 3m 限制宽窄差异；增加平均宽度可获得完整差异范围");
  const obstacles = [
    ...plan.rocks,
    ...plan.buildings.map((b) => ({ ...b, groupId: b.regionId, role: "terrace" as const, obb: b.outline }))
  ];
  const villageQueries = plan.regions
    .filter((region) => region.kind === "village" || region.kind === "teleport")
    .map((region) => ({
      region,
      entrances: data.ports
        .filter((port) => port.ownerId === region.id && port.kind === "entrance")
        .map((port) => port.position),
      query: createPlanningRingQuery(region.outline)
    }));
  const landQuery = createPlanningRingQuery(plan.land),
    waterQueries = plan.waters.map((water) => ({ water, query: createPlanningRingQuery(water.outline) }));
  // Queries share immutable water rings for this build. Keep exact argument
  // order and coordinates, so caching cannot alter boundary-tolerance decisions.
  const dryCache = new Map<string, boolean>();
  const dry = (a: PlanPoint, b: PlanPoint, w: number) => {
    const key = `${w}:${a.x},${a.z}:${b.x},${b.z}`,
      known = dryCache.get(key);
    if (known !== undefined) return known;
    const result = !waterQueries.some(({ query }) => query.touchesSegment(a, b, w / 2));
    if (dryCache.size < 50000) dryCache.set(key, result);
    return result;
  };
  const obstacleBounds = obstacles.map((rock) => {
    const c = Math.abs(Math.cos(rock.yaw)),
      s = Math.abs(Math.sin(rock.yaw)),
      rx = (rock.width * c + rock.depth * s) / 2,
      rz = (rock.width * s + rock.depth * c) / 2;
    return { x0: rock.center.x - rx, x1: rock.center.x + rx, z0: rock.center.z - rz, z1: rock.center.z + rz };
  });
  const clear = (a: PlanPoint, b: PlanPoint, w = width, ignored?: string) => {
    if (!landQuery.containsSegment(a, b, w / 2 + 1)) return false;
    for (const { entrances, query } of villageQueries) {
      const length = distance(a, b),
        pad = Math.min(0.49, (w + 2) / (length || 1));
      const gateway = (p: PlanPoint) => entrances.some((point) => (p.x - point.x) ** 2 + (p.z - point.z) ** 2 < 0.0001);
      const aa = gateway(a) ? interpolate(a, b, pad) : a,
        bb = gateway(b) ? interpolate(b, a, pad) : b;
      if (query.touchesSegment(aa, bb, w / 2)) return false;
    }
    const padding = (w / 2 + 1) * Math.SQRT2,
      x0 = Math.min(a.x, b.x) - padding,
      x1 = Math.max(a.x, b.x) + padding,
      z0 = Math.min(a.z, b.z) - padding,
      z1 = Math.max(a.z, b.z) + padding;
    return !obstacles.some((rock, i) => {
      const box = obstacleBounds[i];
      return (
        rock.id !== ignored &&
        box.x0 <= x1 &&
        box.x1 >= x0 &&
        box.z0 <= z1 &&
        box.z1 >= z0 &&
        routeIntersectsRock(a, b, rock, w / 2 + 1)
      );
    });
  };
  const check = (
    id: string,
    rule: string,
    owners: string[],
    pass: boolean,
    message: string,
    required = true,
    position?: PlanPoint
  ) => data.checks.push({ id, rule, owners, status: pass ? "pass" : "fail", required, message, position });
  type Crossing = { a: PlanPoint; b: PlanPoint; waterIds: string[] };
  const crossingSpans = (a: PlanPoint, b: PlanPoint, w: number): Crossing[] => {
    if (dry(a, b, w)) return [];
    const touching = waterQueries.filter(({ query }) => query.touchesSegment(a, b, w / 2)),
      cuts = [0, 1],
      dx = b.x - a.x,
      dz = b.z - a.z;
    for (const { water } of touching)
      for (let j = 0; j < water.outline.length; j++) {
        const p = water.outline[j],
          q = water.outline[(j + 1) % water.outline.length],
          ex = q.x - p.x,
          ez = q.z - p.z,
          den = dx * ez - dz * ex;
        if (Math.abs(den) < 1e-9) continue;
        const t = ((p.x - a.x) * ez - (p.z - a.z) * ex) / den,
          u = ((p.x - a.x) * dz - (p.z - a.z) * dx) / den;
        if (t >= 0 && t <= 1 && u >= 0 && u <= 1) cuts.push(t);
      }
    cuts.sort((x, y) => x - y);
    const intervals: { lo: number; hi: number }[] = [],
      length = distance(a, b),
      padding = (24 + w / 2 + PLANNING_TRAVERSAL.landingLength) / (length || 1);
    for (let j = 1; j < cuts.length; j++)
      if (touching.some(({ query }) => query.inside(interpolate(a, b, (cuts[j - 1] + cuts[j]) / 2)))) {
        const lo = Math.max(0, cuts[j - 1] - padding),
          hi = Math.min(1, cuts[j] + padding),
          last = intervals.at(-1);
        if (last && lo <= last.hi) last.hi = Math.max(last.hi, hi);
        else intervals.push({ lo, hi });
      }
    // A grazing full-width overlap still requires explicit crossing support.
    if (!intervals.length) intervals.push({ lo: 0, hi: 1 });
    return intervals.map((interval) => ({
      a: interpolate(a, b, interval.lo),
      b: interpolate(a, b, interval.hi),
      waterIds: touching
        .filter(({ query }) =>
          query.touchesSegment(interpolate(a, b, interval.lo), interpolate(a, b, interval.hi), w / 2)
        )
        .map(({ water }) => water.id)
    }));
  };
  const crossingValid = (crossing: Crossing, w: number) => {
    const span = distance(crossing.a, crossing.b),
      grade = Math.abs(sampleGround(crossing.a) - sampleGround(crossing.b)) / (span || 1);
    return (
      (data.auditMode === "paused" ||
        (span <= PLANNING_TRAVERSAL.maxCrossingSpan && grade <= PLANNING_TRAVERSAL.maxCrossingGrade)) &&
      w >= PLANNING_TRAVERSAL.minWidth &&
      dry(crossing.a, crossing.a, w) &&
      dry(crossing.b, crossing.b, w)
    );
  };
  const heightCache = new Map<number, Map<number, number>>();
  const ground = (p: PlanPoint) => {
    let column = heightCache.get(p.x);
    const known = column?.get(p.z);
    if (known !== undefined) return known;
    const value = sampleGround(p);
    if (!column) {
      column = new Map();
      heightCache.set(p.x, column);
    }
    column.set(p.z, value);
    return value;
  };
  const crossingHeight = (p: PlanPoint, crossings: Crossing[]): number => {
    for (const crossing of crossings) {
      const dx = crossing.b.x - crossing.a.x,
        dz = crossing.b.z - crossing.a.z,
        len2 = dx * dx + dz * dz,
        t = ((p.x - crossing.a.x) * dx + (p.z - crossing.a.z) * dz) / (len2 || 1),
        q = interpolate(crossing.a, crossing.b, t);
      if (t >= -1e-6 && t <= 1 + 1e-6 && distance(p, q) < 0.02)
        return ground(crossing.a) + (ground(crossing.b) - ground(crossing.a)) * t;
    }
    return ground(p);
  };
  const slopeOK = (a: PlanPoint, b: PlanPoint, crossings: Crossing[]): boolean => {
    if (data.auditMode === "paused") return true;
    const length = distance(a, b),
      count = Math.max(1, Math.ceil(length / 4));
    let previous = crossingHeight(a, crossings);
    for (let i = 0; i <= count; i++) {
      const p = interpolate(a, b, i / count),
        height = crossingHeight(p, crossings);
      if (i && Math.abs(height - previous) / (length / count || 1) > PLANNING_TRAVERSAL.maxSlope) return false;
      previous = height;
      const bridged = crossings.some((c) => distance(p, c.a) + distance(p, c.b) <= distance(c.a, c.b) + 0.01);
      if (!bridged && length > 0) {
        const nx = ((-(b.z - a.z) / length) * width) / 2,
          nz = (((b.x - a.x) / length) * width) / 2;
        if (
          Math.abs(ground({ x: p.x + nx, z: p.z + nz }) - ground({ x: p.x - nx, z: p.z - nz })) / width >
          PLANNING_TRAVERSAL.maxSlope
        )
          return false;
      }
    }
    return true;
  };
  const profilePoints = (points: PlanPoint[], crossings: Crossing[]) =>
    points.slice(1).flatMap((b, i) => {
      const a = points[i],
        count = Math.max(1, Math.ceil(distance(a, b) / 4));
      return Array.from({ length: count + (i === 0 ? 1 : 0) }, (_, j) => {
        const p = interpolate(a, b, (j + (i === 0 ? 0 : 1)) / count);
        return { ...p, y: crossingHeight(p, crossings) };
      });
    });
  // Stable numeric vertex identities avoid serializing grid coordinates on every A* edge.
  const pointIds = new WeakMap<PlanPoint, { x: number; z: number; id: number }>(),
    coordinates = new Map<number, Map<number, number>>();
  let nextPointId = 0;
  const pointId = (p: PlanPoint) => {
    const known = pointIds.get(p);
    if (known && known.x === p.x && known.z === p.z) return known.id;
    let id: number | undefined;
    let column = coordinates.get(p.x);
    if (!column) {
      column = new Map();
      coordinates.set(p.x, column);
    }
    id = column.get(p.z);
    if (id === undefined) {
      id = nextPointId++;
      column.set(p.z, id);
    }
    pointIds.set(p, { x: p.x, z: p.z, id });
    return id;
  };
  const edgeCaches = [new Map<number, Map<number, boolean>>(), new Map<number, Map<number, boolean>>()];
  const feasible = (a: PlanPoint, b: PlanPoint, allowCrossing: boolean): boolean => {
    const ia = pointId(a),
      ib = pointId(b),
      lo = Math.min(ia, ib),
      hi = Math.max(ia, ib),
      cache = edgeCaches[Number(allowCrossing)];
    let row = cache.get(lo);
    const cached = row?.get(hi);
    if (cached !== undefined) return cached;
    const result = feasibleUncached(a, b, allowCrossing);
    if (!row) {
      row = new Map();
      cache.set(lo, row);
    }
    row.set(hi, result);
    return result;
  };
  const feasibleUncached = (a: PlanPoint, b: PlanPoint, allowCrossing: boolean): boolean => {
    if (!clear(a, b)) return false;
    if (dry(a, b, width)) return slopeOK(a, b, []);
    const crossings = crossingSpans(a, b, width);
    return (
      allowCrossing &&
      dry(a, a, width) &&
      dry(b, b, width) &&
      crossings.every((crossing) => crossingValid(crossing, width)) &&
      slopeOK(a, b, crossings)
    );
  };
  const pathDecisions = new WeakMap<PlanPoint[], string>();
  const grids = new Map<number, PlanPoint[]>();
  // Both graph vertices and crossing landings are dry. A planned crossing is
  // one bounded jump across the entire union, never a chain of submerged cells.
  const path = (a: PlanPoint, b: PlanPoint, resolution = 32): PlanPoint[] | undefined => {
    if (feasible(a, b, false)) return [a, b];
    const search = (allowCrossing: boolean): PlanPoint[] | undefined => {
      if (allowCrossing && feasible(a, b, true)) return [a, b];
      const step = resolution,
        columns = Math.ceil(plan.parameters.width / step) + 1,
        rows = Math.ceil(plan.parameters.depth / step) + 1,
        total = columns * rows;
      let grid = grids.get(step);
      if (!grid) {
        grid = Array.from({ length: total }, (_, id) => ({
          x: (id % columns) * step,
          z: Math.floor(id / columns) * step
        }));
        grids.set(step, grid);
      }
      const at = (id: number) => grid![id];
      const near = (p: PlanPoint) => {
        const x = Math.round(p.x / step),
          z = Math.round(p.z / step),
          ids: number[] = [];
        for (let radius = 1; radius <= 4 && !ids.length; radius++) {
          for (let dz = -radius; dz <= radius; dz++)
            for (let dx = -radius; dx <= radius; dx++) {
              if (radius > 1 && Math.max(Math.abs(dx), Math.abs(dz)) !== radius) continue;
              const id = (z + dz) * columns + x + dx;
              if (x + dx >= 0 && x + dx < columns && z + dz >= 0 && z + dz < rows && feasible(p, at(id), allowCrossing))
                ids.push(id);
            }
        }
        return ids;
      };
      const starts = near(a),
        ends = new Set(near(b));
      if (!starts.length || !ends.size) return;
      const costs = new Float64Array(total).fill(Infinity),
        parents = new Int32Array(total).fill(-1),
        closed = new Uint8Array(total),
        open = new Set<number>();
      for (const id of starts) {
        costs[id] = distance(a, at(id));
        open.add(id);
      }
      // Dry-only routing is a preference search. Bound it independently before
      // entering the same hard-checked graph with complete crossing candidates.
      let budget = Math.min(total, 5000);
      while (open.size && budget-- > 0) {
        let id = -1,
          best = Infinity;
        for (const candidate of open) {
          const f = costs[candidate] + distance(at(candidate), b);
          if (f < best) {
            best = f;
            id = candidate;
          }
        }
        if (ends.has(id)) {
          const points: PlanPoint[] = [b];
          while (id >= 0) {
            points.push(at(id));
            id = parents[id];
          }
          points.push(a);
          points.reverse();
          const result = [a];
          let i = 0;
          while (i < points.length - 1) {
            let next = points.length - 1;
            while (next > i + 1 && !feasible(points[i], points[next], allowCrossing)) next--;
            result.push(points[next]);
            i = next;
          }
          return result;
        }
        open.delete(id);
        closed[id] = 1;
        const x = id % columns,
          z = Math.floor(id / columns),
          p = at(id);
        for (let dz = -1; dz <= 1; dz++)
          for (let dx = -1; dx <= 1; dx++) {
            if (!dx && !dz) continue;
            for (let jump = 1; jump <= (allowCrossing ? 5 : 1); jump++) {
              const xx = x + dx * jump,
                zz = z + dz * jump;
              if (xx < 0 || xx >= columns || zz < 0 || zz >= rows) break;
              const next = zz * columns + xx,
                q = at(next);
              if (closed[next] || !feasible(p, q, allowCrossing)) continue;
              const cost = costs[id] + distance(p, q);
              if (cost < costs[next]) {
                costs[next] = cost;
                parents[next] = id;
                open.add(next);
              }
            }
          }
      }
    };
    const dryPath = search(false),
      crossingPath = search(true);
    const length = (points: PlanPoint[]) => points.slice(1).reduce((sum, p, i) => sum + distance(points[i], p), 0);
    const ratio = Math.max(1, options.crossingDetourRatio ?? PLANNING_REFERENCE.road.crossingDetourRatio);
    const selected =
      crossingPath && (!dryPath || length(dryPath) / length(crossingPath) > ratio)
        ? crossingPath
        : (dryPath ?? crossingPath);
    if (selected)
      pathDecisions.set(
        selected,
        `相同端点 (${a.x.toFixed(1)},${a.z.toFixed(1)}) → (${b.x.toFixed(1)},${b.z.toFixed(1)})：旱路 ${dryPath ? length(dryPath).toFixed(1) + "m" : "有界搜索未找到"}，含接近段的跨越候选 ${crossingPath ? length(crossingPath).toFixed(1) + "m" : "不可行"}，绕行阈值 ${ratio}`
      );
    return selected;
  };
  const add = (
    id: string,
    from: string,
    to: string,
    points: PlanPoint[],
    routeWidth = options.roadWidth,
    keepCurve = false
  ) => {
    const reservedWidth =
      (routeWidth + Math.max(0, Math.min(routeWidth * 0.5, routeWidth - PLANNING_TRAVERSAL.minWidth)) * variation) *
        1.18 +
      routeWidth * 0.24;
    if (!plan.landformStudy && !keepCurve && !id.startsWith("route-loop-")) {
      const originalLength = points.slice(1).reduce((sum, p, i) => sum + distance(points[i], p), 0),
        destination = data.ports.find((p) => p.id === to);
      const goals = [{ id: to, point: points.at(-1)! }];
      const junctionCost = routeWidth * 2;
      const ranked = goals
        .flatMap((goal) =>
          plan.routes
            .filter((route) => route.kind === "main" && !route.id.includes("-internal-") && !route.id.endsWith("-path"))
            .flatMap((route) =>
              route.points.slice(1).map((b, i) => {
                const a = route.points[i],
                  dx = b.x - a.x,
                  dz = b.z - a.z,
                  t = Math.max(
                    0.05,
                    Math.min(0.95, ((goal.point.x - a.x) * dx + (goal.point.z - a.z) * dz) / (dx * dx + dz * dz || 1))
                  );
                const point = interpolate(a, b, t);
                return { route, point, index: i + 1, gap: distance(point, goal.point), goal };
              })
            )
        )
        .filter(
          (candidate) =>
            candidate.gap + junctionCost < originalLength && dry(candidate.point, candidate.point, reservedWidth)
        )
        .sort((a, b) => a.gap - b.gap);
      const candidates = ranked
        .filter(
          (candidate, i) =>
            !ranked
              .slice(0, i)
              .some(
                (prior) =>
                  prior.goal.id === candidate.goal.id &&
                  prior.route.id === candidate.route.id &&
                  distance(prior.point, candidate.point) < 24
              )
        )
        .slice(0, 24);
      let best: { candidate: (typeof candidates)[number]; branch: PlanPoint[]; cost: number } | undefined;
      for (const candidate of candidates) {
        if (candidate.gap + junctionCost >= (best?.cost ?? originalLength)) continue;
        const branch = path(candidate.point, candidate.goal.point);
        if (!branch) continue;
        const cost = branch.slice(1).reduce((sum, p, i) => sum + distance(branch[i], p), 0) + junctionCost;
        if (cost < (best?.cost ?? originalLength)) best = { candidate, branch, cost };
      }
      if (best) {
        const { candidate, branch, cost } = best;
        const existing = candidate.route,
          junction = `${id}-junction`,
          head = [...existing.points.slice(0, candidate.index), candidate.point],
          tail = [candidate.point, ...existing.points.slice(candidate.index)];
        data.ports.push({
          id: junction,
          ownerId: "routes",
          kind: "landing",
          position: { ...candidate.point },
          height: sampleGround(candidate.point),
          width: routeWidth,
          surfaceId: "ground-final"
        });
        const removedBridges = new Set(
          plan.bridges.filter((bridge) => bridge.id.startsWith(`${existing.id}-crossing-`)).map((bridge) => bridge.id)
        );
        plan.routes = plan.routes.filter((route) => route !== existing);
        plan.bridges = plan.bridges.filter((bridge) => !removedBridges.has(bridge.id));
        data.ports = data.ports.filter(
          (port) => ![...removedBridges].some((bridge) => port.id === `${bridge}-0` || port.id === `${bridge}-1`)
        );
        data.profiles = data.profiles.filter((profile) => profile.ownerId !== existing.id);
        data.relations = data.relations.filter((relation) => relation.id !== existing.id);
        data.reservations = data.reservations.filter((reservation) => !reservation.relatedIds.includes(existing.id));
        data.checks = data.checks.filter((check) => !removedBridges.has(check.id));
        plan.shapeRecipes = plan.shapeRecipes?.filter((recipe) => recipe.id !== existing.shapeRecipeId);
        add(existing.id, existing.from, junction, head, existing.width, true);
        add(`${existing.id}-continuation-${id}`, junction, existing.to, tail, existing.width, true);
        data.adjustments.push({
          owners: [junction, existing.id, id],
          reason: `场所支路复用主干：独立新建 ${originalLength.toFixed(1)}m，支路加分叉预算 ${cost.toFixed(1)}m（分叉 ${junctionCost.toFixed(1)}m）`
        });
        from = junction;
        to = candidate.goal.id;
        points = branch;
      }
    }
    const decision = pathDecisions.get(points);
    if (decision) data.adjustments.push({ owners: [id, from, to], reason: decision });
    const unbentPoints = points;
    if (!keepCurve) {
      // Entrances supply actual heading anchors. Search vertices represent obstacle
      // passages; round their corners inside the already feasible corridor.
      const anchored = [points[0]];
      for (let i = 1; i < points.length; i++) {
        for (const crossing of crossingSpans(points[i - 1], points[i], reservedWidth))
          for (const point of [crossing.a, crossing.b])
            if (distance(anchored.at(-1)!, point) > 0.01) anchored.push(point);
        if (distance(anchored.at(-1)!, points[i]) > 0.01) anchored.push(points[i]);
      }
      const lead = (portId: string): PlanPoint | undefined => {
        const port = data.ports.find((port) => port.id === portId && port.kind === "entrance");
        const activity = port && data.ports.find((p) => p.ownerId === port.ownerId && p.id.endsWith("-activity"));
        if (!port || !activity) return;
        const d = distance(activity.position, port.position);
        if (d < 1) return;
        const length = Math.min(32, Math.max(12, routeWidth * 3));
        return {
          x: port.position.x + ((port.position.x - activity.position.x) / d) * length,
          z: port.position.z + ((port.position.z - activity.position.z) / d) * length
        };
      };
      const first = lead(from),
        last = lead(to);
      if (first && feasible(anchored[0], first, false) && feasible(first, anchored[1], true))
        anchored.splice(1, 0, first);
      if (last && feasible(anchored.at(-2)!, last, true) && feasible(last, anchored.at(-1)!, false))
        anchored.splice(anchored.length - 1, 0, last);
      const features = [
        { id: "land-coast", owner: "land", role: "海岸", ring: plan.land },
        ...plan.rocks.map((r) => ({ id: r.id, owner: r.groupId, role: "山脚", ring: r.outline })),
        ...plan.waters.map((w) => ({ id: w.id, owner: w.id, role: "岸线", ring: w.outline }))
      ];
      // Long open passages can follow an actual nearby foot/bank. The point is
      // offset from that feature towards the viable corridor, never a sight target.
      for (let round = 0; round < (plan.landformStudy ? 0 : 2); round++) {
        const steered = [anchored[0]];
        let changed = false;
        for (let i = 1; i < anchored.length; i++) {
          const a = anchored[i - 1],
            b = anchored[i],
            length = distance(a, b);
          if (length > 160 && dry(a, b, reservedWidth)) {
            const dx = b.x - a.x,
              dz = b.z - a.z;
            const candidates = features
              .flatMap((feature) =>
                feature.ring
                  .filter((_, j) => j % Math.max(1, Math.ceil(feature.ring.length / 24)) === 0)
                  .flatMap((p) => {
                    const t = ((p.x - a.x) * dx + (p.z - a.z) * dz) / (length * length);
                    if (t < 0.2 || t > 0.8) return [];
                    const chord = interpolate(a, b, t),
                      gap = distance(p, chord),
                      setback = reservedWidth * 1.5 + 8;
                    if (gap < 1 || Math.abs(gap - setback) < 8 || gap > Math.min(110, length * 0.3)) return [];
                    const point = interpolate(p, chord, setback / gap),
                      detour = distance(a, point) + distance(point, b);
                    if (detour > length * 1.18) return [];
                    return [{ feature, point, score: detour + Math.abs(t - 0.5) * length * 0.12 }];
                  })
              )
              .sort((a, b) => a.score - b.score)
              .slice(0, 20);
            const candidate = candidates.find((c) => feasible(a, c.point, false) && feasible(c.point, b, false));
            if (candidate) {
              steered.push(candidate.point);
              changed = true;
              data.adjustments.push({
                owners: [id, candidate.feature.owner, candidate.feature.id],
                reason: `${candidate.feature.role}通廊关键点 (${candidate.point.x.toFixed(1)},${candidate.point.z.toFixed(1)})：沿实际轮廓退让，完整占地可行，候选绕行不超过18%`
              });
            }
          }
          steered.push(b);
        }
        if (!changed) break;
        anchored.splice(0, anchored.length, ...steered);
      }
      const curved = [anchored[0]];
      for (let i = 1; i < anchored.length - 1; i++) {
        const a = anchored[i - 1],
          b = anchored[i],
          c = anchored[i + 1];
        let accepted = false;
        if (dry(a, b, reservedWidth) && dry(b, c, reservedWidth))
          for (const fraction of [0.3, 0.15, 0.06]) {
            const start = interpolate(b, a, fraction),
              end = interpolate(b, c, fraction);
            const curve = Array.from({ length: 9 }, (_, j) => {
              const t = j / 8;
              return {
                x: (1 - t) ** 2 * start.x + 2 * t * (1 - t) * b.x + t * t * end.x,
                z: (1 - t) ** 2 * start.z + 2 * t * (1 - t) * b.z + t * t * end.z
              };
            });
            if (
              feasible(curved.at(-1)!, start, false) &&
              curve.slice(1).every((p, j) => feasible(curve[j], p, false)) &&
              feasible(end, c, false)
            ) {
              curved.push(...curve);
              accepted = true;
              break;
            }
          }
        if (!accepted) curved.push(b);
      }
      curved.push(anchored.at(-1)!);
      if (curved.slice(1).every((p, i) => feasible(curved[i], p, true))) points = curved;
      data.adjustments.push({
        owners: [id, from, to],
        reason: "入口朝向、环境通廊和实际分叉决定关键点；仅在完整占地可行时圆滑转角"
      });
    }
    const crossings = points.slice(1).flatMap((b, i) => crossingSpans(points[i], b, reservedWidth));
    const supported = crossings.length === 0;
    const detail = Math.max(0, Math.min(1, options.roadContourDetail ?? 0.5));
    const recipe: ShapeRecipe = {
      id: `${id}-shape`,
      label: "连续变宽道路",
      rounding: Math.min(0.5, routeWidth * 0.04),
      blocks: []
    };
    const spans: { a: PlanPoint; b: PlanPoint; length: number; mid: number }[] = [];
    let travel = 0;
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1],
        b = points[i],
        length = distance(a, b),
        count = Math.max(1, Math.ceil(length / (48 - 36 * detail)));
      for (let j = 0; j < count; j++) {
        const p = interpolate(a, b, j / count),
          q = interpolate(a, b, (j + 1) / count),
          span = distance(p, q);
        spans.push({ a: p, b: q, length: span, mid: travel + span / 2 });
        travel += span;
      }
    }
    const widths = planningRoadComponentWidths(
      routeWidth,
      variation,
      spans.map((span) => span.length),
      plan.parameters.seed,
      id
    );
    // Detail subdivides the actual corridor; component widths vary without
    // inventing unrelated lateral wiggles or moving shared endpoint mouths.
    for (let i = 0; i < spans.length; i++) {
      const { a, b, length } = spans[i],
        localWidth = widths[i];
      recipe.blocks.push({
        id: `${id}-block-${i}`,
        x: (a.x + b.x) / 2,
        z: (a.z + b.z) / 2,
        width: localWidth,
        length: length + localWidth * 0.55,
        yaw: (Math.atan2(b.z - a.z, b.x - a.x) * 180) / Math.PI - 90
      });
    }
    let outline: PlanPoint[];
    try {
      // The region compiler applies Bezier tangents even at zero rounding; on long
      // roads those tangents leave the reserved rectangle footprint. Keep the exact
      // union here so source widths and the independently audited footprint agree.
      const rings = unionRectangles(recipe.blocks, 1e-10);
      if (
        rings.filter(
          (r) =>
            r.reduce((sum, p, i) => {
              const b = r[(i + 1) % r.length];
              return sum + p.x * b.z - b.x * p.z;
            }, 0) > 0
        ).length !== 1
      )
        throw new Error("道路矩形并集必须形成一个连通区域");
      outline = ribbonOutline([spans[0].a, ...spans.map((s) => s.b)], widths);
    } catch (error) {
      if (!keepCurve) {
        add(id, from, to, unbentPoints, routeWidth, true);
        return;
      }
      throw error;
    }
    plan.shapeRecipes ??= [];
    plan.shapeRecipes.push(recipe);
    plan.routes.push({
      id,
      label: "连续变宽道路",
      from,
      to,
      kind: "main",
      points,
      width: routeWidth,
      maxWidth: reservedWidth,
      outline,
      shapeRecipeId: recipe.id
    });
    data.relations.push({
      id,
      kind: "connects",
      owners: ["routes", from, to],
      ports: [from, to],
      required: true,
      network: supported ? "supported" : "planned"
    });
    for (let i = 1; i < points.length; i++)
      data.reservations.push({
        id: `${id}-corridor-${i}`,
        ownerId: "routes",
        kind: "corridor",
        outline: planningCorridor(points[i - 1], points[i], reservedWidth),
        relatedIds: [id]
      });
    data.profiles.push({
      id: `${id}-profile`,
      ownerId: id,
      kind: "route",
      points: profilePoints(points, crossings),
      width: reservedWidth,
      supportIds: supported ? ["ground-final"] : []
    });
    crossings.forEach((crossing, i) => {
      const crossingId = `${id}-crossing-${i}`,
        span = distance(crossing.a, crossing.b),
        ok = crossingValid(crossing, reservedWidth);
      plan.bridges.push({
        id: crossingId,
        label: "规划跨越（未建承接）",
        a: crossing.a,
        b: crossing.b,
        width: reservedWidth,
        riverId: crossing.waterIds[0]
      });
      data.ports.push(
        ...[crossing.a, crossing.b].map((p, j) => ({
          id: `${crossingId}-${j}`,
          ownerId: "routes",
          position: p,
          height: sampleGround(p),
          width: reservedWidth,
          kind: "landing" as const,
          surfaceId: "ground"
        }))
      );
      data.checks.push({
        id: crossingId,
        rule: "R03",
        owners: [id, ...crossing.waterIds],
        status: ok ? "pass" : "fail",
        required: true,
        message: "水域并集跨越规划：跨度 ≤160m、坡度 ≤0.15、落脚 6m；非受支持步行边",
        position: crossing.a,
        measured: span,
        limit: PLANNING_TRAVERSAL.maxCrossingSpan
      });
    });
  };
  const entrances = data.ports.filter(
    (p) => p.kind === "entrance" && (p.ownerId.startsWith("village-") || p.ownerId.startsWith("teleport-"))
  );
  // Establish one long destination trunk, then attach nearby destinations to it.
  const owners = [...new Set(entrances.map((port) => port.ownerId))].sort(
      (a, b) => Number(!a.startsWith("teleport-")) - Number(!b.startsWith("teleport-")) || a.localeCompare(b)
    ),
    connected = entrances.filter((port) => port.ownerId === owners[0]),
    pending = owners.slice(1),
    edges = new Set<string>();
  const edge = (a: string, b: string) => [a, b].sort().join("|");
  while (pending.length) {
    const pairs = pending
      .flatMap((owner, i) =>
        entrances
          .filter((port) => port.ownerId === owner)
          .flatMap((b) => connected.map((a) => ({ a, b, i, d: distance(a.position, b.position) })))
      )
      .sort((a, b) => (edges.size ? a.d - b.d : b.d - a.d));
    let linked = false;
    for (const pair of pairs) {
      const points = path(pair.a.position, pair.b.position);
      if (!points) continue;
      add(`route-${pair.b.ownerId}`, pair.a.id, pair.b.id, points);
      edges.add(edge(pair.a.ownerId, pair.b.ownerId));
      connected.push(...entrances.filter((port) => port.ownerId === pair.b.ownerId));
      pending.splice(pair.i, 1);
      linked = true;
      break;
    }
    if (!linked) break;
  }
  // Every authored village mouth gets an external link; a connected village alone is insufficient.
  const served = new Set(
    plan.routes.filter((r) => !r.id.includes("-internal-") && !r.id.endsWith("-path")).flatMap((r) => [r.from, r.to])
  );
  for (const entrance of entrances) {
    // Trunk reuse may replace the requested source with a junction. Only a
    // published endpoint proves that this particular mouth has an external road.
    if (
      plan.routes.some(
        (r) =>
          !r.id.includes("-internal-") && !r.id.endsWith("-path") && (r.from === entrance.id || r.to === entrance.id)
      )
    )
      continue;
    const candidates = entrances
      .filter((other) => other.id !== entrance.id && (other.ownerId !== entrance.ownerId || served.has(other.id)))
      .sort(
        (a, b) =>
          Number(a.ownerId === entrance.ownerId) - Number(b.ownerId === entrance.ownerId) ||
          distance(a.position, entrance.position) - distance(b.position, entrance.position)
      );
    let linked = false;
    for (const other of candidates) {
      const points = path(entrance.position, other.position);
      if (!points) continue;
      add(`route-mouth-${entrance.id}`, other.id, entrance.id, [...points].reverse());
      served.add(entrance.id);
      served.add(other.id);
      linked = true;
      break;
    }
    if (!linked) {
      const region = plan.regions.find((r) => r.id === entrance.ownerId),
        activity = data.ports.find((p) => p.id === `${entrance.ownerId}-activity`),
        original = { ...entrance.position };
      if (region && activity) {
        const allBoundary = region.outline.flatMap((a, i) =>
          [0.25, 0.5, 0.75].map((t) => interpolate(a, region.outline[(i + 1) % region.outline.length], t))
        );
        const boundary = [
          ...allBoundary
            .slice()
            .sort((a, b) => distance(a, original) - distance(b, original))
            .slice(0, 24),
          ...allBoundary.filter((_, i) => i % Math.max(1, Math.ceil(allBoundary.length / 96)) === 0)
        ];
        for (const point of boundary) {
          if (
            entrances.some(
              (p) => p !== entrance && p.ownerId === entrance.ownerId && distance(p.position, point) < width * 2
            )
          )
            continue;
          const internal = findVillageAreaPath(
            plan,
            region,
            activity.position,
            point,
            region.navigationWidth ?? 4,
            sampleGround
          );
          if (!internal) continue;
          Object.assign(entrance.position, point);
          for (const other of candidates.slice(0, 8)) {
            const points = path(other.position, entrance.position) ?? path(other.position, entrance.position, 16);
            if (!points) continue;
            add(`route-mouth-${entrance.id}`, other.id, entrance.id, points);
            const link = region.navigationLinks?.find((l) => l.to === entrance.id);
            if (link) link.points = internal;
            const place = plan.places.find((p) => p.id === entrance.id);
            if (place) place.center = { ...point };
            entrance.height = sampleGround(point);
            served.add(entrance.id);
            linked = true;
            data.adjustments.push({
              owners: [entrance.ownerId, entrance.id],
              reason: "原村口位于无法对外接路的边界凹口，沿同一村落边界选择可连接位置，并同步内部通路"
            });
            break;
          }
          if (linked) break;
          Object.assign(entrance.position, original);
        }
      }
      if (!linked) notes.push(`${entrance.id}：未生成对外道路`);
    }
  }
  const required = data.requiredIds.filter((id) => id.startsWith("village-") || id.startsWith("teleport-"));
  for (const id of required) {
    const reached = connected.some((p) => p.ownerId === id);
    check(
      `${id}-external`,
      "P02",
      [id, "routes"],
      reached,
      reached ? "场所入口接入规划网络" : "必需场所缺少可用入口或未接入规划网络"
    );
    if (!reached) notes.push(`${id}：必需对外连接未满足`);
  }
  let loops = Math.round(options.loopiness * Math.max(0, owners.length - 2));
  for (let i = 0; i < connected.length && loops > 0; i++)
    for (let j = i + 1; j < connected.length && loops > 0; j++) {
      const a = connected[i],
        b = connected[j];
      if (a.ownerId === b.ownerId || edges.has(edge(a.ownerId, b.ownerId))) continue;
      const points = path(a.position, b.position);
      if (points) {
        add(`route-loop-${i}-${j}`, a.id, b.id, points);
        edges.add(edge(a.ownerId, b.ownerId));
        loops--;
      }
    }
  // Local internal routes are generated by the village owner before external routing.
  for (const route of plan.routes.filter((r) => r.id.includes("-internal-") || r.id.endsWith("-path"))) {
    const supported = route.points
      .slice(1)
      .every((b, i) => clear(route.points[i], b, route.width) && dry(route.points[i], b, route.width));
    check(
      `${route.id}-clear`,
      "P01",
      [route.from.split("-activity")[0], route.id],
      supported,
      supported ? "内部通路全宽有地面且避开建筑" : "内部通路缺少全宽承接或被占用"
    );
    data.profiles.push({
      id: `${route.id}-profile`,
      ownerId: route.id,
      kind: "route",
      points: profilePoints(route.points, []),
      width: route.width,
      supportIds: ["ground-final"]
    });
  }
  // Choose spawn only now, on a valid activity area with a supported local entrance edge.
  const candidates = data.ports.filter(
    (p) => p.id.endsWith("-activity") && connected.some((e) => e.ownerId === p.ownerId)
  );
  const visualTargets = plan.rocks
    .filter((r) => r.role === "peak")
    .map((r) => ({ id: r.id, point: r.center, height: (r.baseHeight ?? sampleGround(r.center)) + r.height }));
  const viewScore = (p: (typeof candidates)[number]) =>
    visualTargets.filter(
      (t) =>
        !planningSightBlocked(plan, p.position, sampleGround(p.position) + 1.7, t.point, t.height, [t.id], sampleGround)
    ).length;
  const rankedCandidates = candidates.map((p) => ({ p, score: viewScore(p) })).sort((a, b) => b.score - a.score);
  const spawn = rankedCandidates
    .map((candidate) => candidate.p)
    .find(
      (p) =>
        landQuery.containsSegment(p.position, p.position, Math.max(width, 6) / 2) &&
        !obstacles.some((rock) => routeIntersectsRock(p.position, p.position, rock, Math.max(width, 6) / 2)) &&
        dry(p.position, p.position, width) &&
        plan.regions.some(
          (region) => region.id === p.ownerId && region.navigationLinks?.some((link) => link.from === p.id)
        )
    );
  if (spawn) {
    plan.spawn = { ...spawn.position };
    data.ports.push({
      id: "spawn",
      ownerId: "spawn",
      kind: "landing",
      position: plan.spawn,
      height: sampleGround(plan.spawn),
      width: 6,
      surfaceId: "ground"
    });
    data.relations.push({
      id: "spawn-connection",
      kind: "connects",
      owners: ["spawn", spawn.ownerId],
      ports: ["spawn", spawn.id],
      required: true,
      network: "supported"
    });
  }
  check(
    "spawn-selection",
    "S01",
    ["spawn"],
    !!spawn,
    spawn ? "出生点位于已连接活动区的受支持地面" : "没有找到接入有效内部通路的安全出生点",
    true,
    plan.spawn
  );
  data.modules.push(
    {
      id: "routes",
      kind: "routes",
      outline: plan.routes.flatMap((r) => r.points),
      dependencies: [
        ...new Set([
          ...required,
          ...plan.rocks.map((r) => r.groupId),
          ...plan.buildings.map((b) => b.regionId),
          ...plan.waters.map((w) => w.id),
          "land-main"
        ])
      ],
      requested: {
        width: options.roadWidth / 6,
        widthVariation: variation,
        complexity: options.roadContourDetail ?? 0.5,
        loops: options.loopiness,
        crossingDetourRatio: options.crossingDetourRatio ?? PLANNING_REFERENCE.road.crossingDetourRatio
      },
      resolved: {
        crossingDetourRatio: options.crossingDetourRatio ?? PLANNING_REFERENCE.road.crossingDetourRatio,
        width: options.roadWidth,
        maxWidth: width,
        complexity: options.roadContourDetail ?? 0.5,
        widthVariation: variation,
        actualWidthVariation:
          variation *
          Math.max(0, Math.min(1, (options.roadWidth - PLANNING_TRAVERSAL.minWidth) / (options.roadWidth * 0.5))),
        widthVariationLimited: options.roadWidth < PLANNING_TRAVERSAL.minWidth * 2 ? 1 : 0,
        routes: plan.routes.length
      }
    },
    {
      id: "spawn",
      kind: "spawn",
      outline: planningCorridor({ x: plan.spawn.x - 6, z: plan.spawn.z }, { x: plan.spawn.x + 6, z: plan.spawn.z }, 12),
      dependencies: spawn ? [spawn.ownerId, "routes"] : ["routes"],
      requested: {},
      resolved: { x: plan.spawn.x, z: plan.spawn.z }
    }
  );
  buildPlanningVisuals(plan, options.visibility);
  const module = data.modules.find((module) => module.id === "routes");
  if (module) {
    module.outline = plan.routes.flatMap((route) => route.points);
    module.resolved.routes = plan.routes.length;
  }
  return notes;
}

/** Absolute-height segment versus the actual rotated planning volume envelopes. */
export function planningSightBlocked(
  plan: IslandPlan,
  from: PlanPoint,
  eye: number,
  to: PlanPoint,
  targetHeight: number,
  ignoredIds: readonly string[] = [],
  sampleGround: (p: PlanPoint) => number = createPlanningGroundSampler(plan)
): boolean {
  const blocked = [...plan.rocks, ...plan.buildings]
    .filter((other) => !ignoredIds.includes(other.id))
    .some((other) => {
      const local = (p: PlanPoint) => {
        const x = p.x - other.center.x,
          z = p.z - other.center.z;
        return {
          x: x * Math.cos(other.yaw) + z * Math.sin(other.yaw),
          z: -x * Math.sin(other.yaw) + z * Math.cos(other.yaw)
        };
      };
      const a = local(from),
        b = local(to);
      let lo = 0,
        hi = 1;
      for (const axis of ["x", "z"] as const) {
        const extent = (axis === "x" ? other.width : other.depth) / 2,
          d = b[axis] - a[axis];
        if (Math.abs(d) < 1e-8) {
          if (Math.abs(a[axis]) > extent) return false;
        } else {
          const t0 = (-extent - a[axis]) / d,
            t1 = (extent - a[axis]) / d;
          lo = Math.max(lo, Math.min(t0, t1));
          hi = Math.min(hi, Math.max(t0, t1));
        }
      }
      const base = other.baseHeight ?? sampleGround(other.center),
        y0 = eye + (targetHeight - eye) * lo,
        y1 = eye + (targetHeight - eye) * hi;
      return lo <= hi && Math.max(y0, y1) >= base && Math.min(y0, y1) <= base + other.height;
    });
  if (blocked) return true;
  // Ground is an analytic planning surface. Sample its intervening profile in
  // addition to exact OBB intersections; this is not pixel visibility evidence.
  const samples = Math.min(256, Math.max(8, Math.ceil(distance(from, to) / 8)));
  for (let i = 1; i < samples; i++) {
    const t = i / samples;
    if (sampleGround(interpolate(from, to, t)) > eye + (targetHeight - eye) * t + 0.05) return true;
  }
  return false;
}

/** Refresh observation evidence without changing terrain or physical routes.
 * Existing target identities persist even when temporarily occluded.
 * @param plan Candidate snapshot, including previously requested observation targets.
 * @param visibility Zero disables observations; a positive value evaluates their geometry.
 */
export function buildPlanningVisuals(plan: IslandPlan, visibility: number): void {
  // The current blockout retains circulation and collision only; visual composition is deferred.
  if (plan.landformStudy) {
    plan.sights = [];
    if (plan.planning)
      plan.planning.relations = plan.planning.relations.filter((r) => r.kind !== "observes" && r.kind !== "frames");
    return;
  }
  const previousSights = new Map(plan.sights.map((s) => [s.id, s]));
  plan.sights = [];
  plan.planning!.relations = plan.planning!.relations.filter((r) => !r.owners.includes("visual"));
  plan.planning!.modules = plan.planning!.modules.filter((m) => m.id !== "visual");
  plan.planning!.checks = plan.planning!.checks.filter((c) => c.rule !== "V01" && c.rule !== "V02");
  const data = plan.planning!,
    sampleGround = createPlanningGroundSampler(plan);
  type Target = {
    id: string;
    ownerId: string;
    point: PlanPoint;
    height: number;
    kind: "peak" | "lake" | "valley" | "tower";
  };
  type Observer = { id: string; point: PlanPoint; height: number; arrival: boolean; surfaceId?: string };
  const targets: Target[] = plan.rocks
    .filter((r) => r.role === "peak")
    .map((r) => ({
      id: r.id,
      ownerId: r.groupId,
      point: r.center,
      height: (r.baseHeight ?? sampleGround(r.center)) + r.height,
      kind: "peak"
    }));
  for (const building of plan.buildings.filter((b) =>
    data.modules.some((m) => m.kind === "teleport" && m.id === b.regionId)
  ))
    targets.push({
      id: building.id,
      ownerId: building.regionId,
      point: building.center,
      height: (building.baseHeight ?? sampleGround(building.center)) + building.height,
      kind: "tower"
    });
  for (const water of plan.waters.filter((w) => w.kind === "lake")) {
    const profile = data.profiles.find((p) => p.kind === "water" && p.ownerId === water.id),
      sample = profile?.points[Math.floor(profile.points.length / 2)];
    if (sample) targets.push({ id: water.id, ownerId: water.id, point: sample, height: sample.y + 0.5, kind: "lake" });
  }
  for (const valley of data.modules.filter((m) => m.kind === "valley")) {
    const region =
      data.reservations.find((r) => r.kind === "valley" && r.ownerId === valley.id)?.outline ?? valley.outline;
    const point = region.length
      ? {
          x: region.reduce((sum, p) => sum + p.x, 0) / region.length,
          z: region.reduce((sum, p) => sum + p.z, 0) / region.length
        }
      : undefined;
    if (point && inside(point, plan.land) && !plan.waters.some((w) => inside(point, w.outline)))
      targets.push({ id: valley.id, ownerId: valley.id, point, height: sampleGround(point) + 1, kind: "valley" });
  }
  const observers: Observer[] = [
    { id: "spawn", point: plan.spawn, height: sampleGround(plan.spawn) + 1.7, arrival: false }
  ];
  for (const tower of plan.buildings.filter((b) =>
    data.modules.some((m) => m.id === b.regionId && m.kind === "teleport")
  ))
    observers.push({
      id: tower.regionId,
      point: tower.center,
      height: (tower.baseHeight ?? sampleGround(tower.center)) + tower.height + 1.7,
      arrival: true,
      surfaceId: tower.id
    });
  const usedPorts = new Set(plan.routes.flatMap((route) => [route.from, route.to]));
  for (const port of data.ports.filter(
    (p) => usedPorts.has(p.id) && (p.kind === "entrance" || p.id.endsWith("-junction"))
  )) {
    if (distance(port.position, plan.spawn) < 2) continue;
    observers.push({
      id: port.id,
      point: port.position,
      height: port.height + 1.7,
      arrival: true,
      surfaceId: port.surfaceId
    });
  }
  for (const route of plan.routes.filter((r) => r.kind === "main")) {
    const lengths = route.points.slice(1).map((p, i) => distance(p, route.points[i]));
    let remaining = lengths.reduce((a, b) => a + b, 0) / 2;
    for (let i = 0; i < lengths.length; i++) {
      if (remaining > lengths[i]) {
        remaining -= lengths[i];
        continue;
      }
      const point = interpolate(route.points[i], route.points[i + 1], remaining / (lengths[i] || 1));
      observers.push({ id: `${route.id}-view`, point, height: sampleGround(point) + 1.7, arrival: false });
      break;
    }
  }
  const dependencies = new Set<string>(["routes", "spawn"]);
  if (visibility > 0)
    for (const observer of observers) {
      // Arrival looks outward to a different lake/valley. Route observers prefer a
      // visible peak; candidate order is deterministic and never accepts a blocked pair.
      const ordered = targets
        .filter(
          (t) =>
            t.id !== observer.surfaceId &&
            distance(observer.point, t.point) > 20 &&
            (observer.id.startsWith("teleport-") ||
              (t.kind === "peak" && !plan.mountains.some((m) => m.id === t.ownerId && m.offshore)))
        )
        .sort(
          (a, b) =>
            Number(a.kind !== "tower") - Number(b.kind !== "tower") ||
            distance(observer.point, a.point) - distance(observer.point, b.point)
        );
      let selected: Target | undefined,
        blockedCount = 0;
      const previousTarget = previousSights.get(`sight-${observer.id}`)?.targetId;
      if (previousTarget) ordered.sort((a, b) => Number(b.id === previousTarget) - Number(a.id === previousTarget));
      for (const target of ordered) {
        const ignored = [target.id, ...(observer.surfaceId ? [observer.surfaceId] : [])];
        if (
          planningSightBlocked(
            plan,
            observer.point,
            observer.height,
            target.point,
            target.height,
            ignored,
            sampleGround
          )
        ) {
          blockedCount++;
          continue;
        }
        selected = target;
        break;
      }
      const id = `sight-${observer.id}`;
      if (!selected) {
        const target = ordered[0];
        if (target) {
          plan.sights.push({
            id,
            status: "fail",
            eyeHeight: observer.height,
            targetHeight: target.height,
            targetId: target.id,
            from: observer.point,
            to: target.point,
            spread: 18,
            label: "观察目标被遮挡"
          });
          data.relations.push({
            id,
            kind: "observes",
            owners: ["visual", observer.id, target.ownerId, target.id],
            ports: [],
            required: false
          });
        }
        data.checks.push({
          id,
          rule: "V01",
          owners: ["visual", observer.id],
          status: ordered.length ? "fail" : "unknown",
          required: false,
          message: ordered.length
            ? `可选观察偏好未满足：${blockedCount} 个实际目标被遮挡`
            : "没有符合该观察点用途的实际目标",
          position: observer.point
        });
        continue;
      }
      if (previousTarget && ordered[0]?.id === previousTarget && selected.id !== previousTarget) {
        const target = ordered[0];
        plan.sights.push({
          id,
          from: observer.point,
          to: target.point,
          spread: 18,
          label: "原观察目标被遮挡",
          status: "fail",
          eyeHeight: observer.height,
          targetHeight: target.height,
          targetId: target.id
        });
        data.relations.push({
          id,
          kind: "observes",
          owners: ["visual", observer.id, target.ownerId, target.id],
          ports: [],
          required: false
        });
        data.checks.push({
          id,
          rule: "V01",
          owners: ["visual", observer.id, target.id],
          status: "fail",
          required: false,
          message: "保留原视觉意图；当前遮挡需要协调",
          position: observer.point
        });
        continue;
      }
      const target = selected;
      dependencies.add(target.ownerId);
      plan.sights.push({
        id,
        status: "pass",
        eyeHeight: observer.height,
        targetHeight: target.height,
        targetId: target.id,
        from: observer.point,
        to: target.point,
        spread: 18,
        label:
          target.kind === "tower"
            ? "看向传送塔"
            : target.kind === "lake"
              ? "看向湖泊"
              : target.kind === "valley"
                ? "看向谷地"
                : "看向山峰"
      });
      data.relations.push({
        id,
        kind: "observes",
        owners: ["visual", observer.id, target.ownerId, target.id],
        ports: data.ports.some((p) => p.id === observer.id) ? [observer.id] : [],
        required: false
      });
      const range = distance(observer.point, target.point);
      data.checks.push({
        id,
        rule: "V01",
        owners: ["visual", observer.id, target.id],
        status: "pass",
        required: false,
        message: `绝对眼高 ${observer.height.toFixed(1)}m 至目标 ${target.height.toFixed(1)}m，OBB 与地表剖面未遮挡；距离 ${range.toFixed(1)}m`,
        position: observer.point,
        measured: range
      });
      data.relations.push({
        id: `${id}-pull`,
        kind: "frames",
        owners: ["visual", observer.id, target.id],
        ports: [],
        required: false
      });
      data.checks.push({
        id: `${id}-pull`,
        rule: "V02",
        owners: ["visual", observer.id, target.id],
        status: "pass",
        required: false,
        message: "可见目标与当前通路/抵达空间关联；仅为空间引导证据，不声称玩家心理反应",
        position: observer.point,
        measured: range
      });
      const dx = (target.point.x - observer.point.x) / range,
        dz = (target.point.z - observer.point.z) / range;
      const depthObjects = plan.rocks
        .filter((r) => r.role === "peak" && !plan.mountains.some((m) => m.id === r.groupId && m.offshore))
        .map((r) => ({
          rock: r,
          depth: (r.center.x - observer.point.x) * dx + (r.center.z - observer.point.z) * dz,
          lateral: Math.abs((r.center.x - observer.point.x) * dz - (r.center.z - observer.point.z) * dx)
        }))
        .filter(
          (item) =>
            item.depth > 40 &&
            item.lateral <= item.depth * Math.tan(Math.PI / 6) &&
            item.rock.height / item.depth > 0.015
        )
        .sort((a, b) => a.depth - b.depth);
      let layers: typeof depthObjects = [];
      for (const near of depthObjects) {
        for (const middle of depthObjects) {
          if (middle.rock.groupId === near.rock.groupId || middle.depth < Math.max(near.depth + 150, near.depth * 1.4))
            continue;
          const far = depthObjects.find(
            (f) =>
              f.rock.groupId !== near.rock.groupId &&
              f.rock.groupId !== middle.rock.groupId &&
              f.depth >= Math.max(middle.depth + 150, middle.depth * 1.4)
          );
          if (far) {
            const trio = [near, middle, far];
            if (
              trio.every(
                (layer) =>
                  !planningSightBlocked(
                    plan,
                    observer.point,
                    observer.height,
                    layer.rock.center,
                    (layer.rock.baseHeight ?? sampleGround(layer.rock.center)) + layer.rock.height,
                    [layer.rock.id, ...(observer.surfaceId ? [observer.surfaceId] : [])],
                    sampleGround
                  )
              )
            ) {
              layers = trio;
              break;
            }
          }
        }
        if (layers.length) break;
      }
      if (layers.length) {
        data.relations.push({
          id: `${id}-depth`,
          kind: "frames",
          owners: ["visual", observer.id, ...layers.map((layer) => layer.rock.id)],
          ports: [],
          required: false
        });
        data.checks.push({
          id: `${id}-depth`,
          rule: "V02",
          owners: ["visual", observer.id],
          status: "pass",
          required: false,
          message: "三个不同主陆山群，实际可见，纵深间隔至少150米且相邻距离比至少1.4；仅为当前可配置构图标准",
          position: observer.point
        });
      }
    }
  for (const route of plan.routes.filter((r) => r.kind === "main" && r.points.length > 2)) {
    const a = route.points[0],
      b = route.points.at(-1)!,
      chord = distance(a, b),
      length = route.points.slice(1).reduce((sum, p, i) => sum + distance(route.points[i], p), 0);
    if (length <= chord + 0.1) continue;
    const blocker = plan.rocks.find(
      (rock) =>
        routeIntersectsRock(a, b, rock, route.width / 2 + 1) &&
        route.points.slice(1).every((p, i) => !routeIntersectsRock(route.points[i], p, rock, route.width / 2 + 1))
    );
    if (!blocker) continue;
    const id = `push-${route.id}-${blocker.id}`;
    data.relations.push({
      id,
      kind: "frames",
      owners: ["visual", route.id, blocker.id, blocker.groupId],
      ports: [],
      required: false
    });
    data.checks.push({
      id,
      rule: "V02",
      owners: ["visual", route.id, blocker.id],
      status: "pass",
      required: false,
      message: `该岩体阻挡端点直连，全宽路线实际绕行；直距 ${chord.toFixed(1)}m、路线 ${length.toFixed(1)}m`,
      position: blocker.center,
      measured: length - chord,
      limit: 0
    });
    dependencies.add(blocker.groupId);
  }
  data.modules.push({
    id: "visual",
    kind: "visual",
    outline: plan.sights.flatMap((s) => [s.from, s.to]),
    dependencies: [...dependencies],
    requested: { visibility },
    resolved: { observations: plan.sights.length }
  });
}

/** Refresh vertical consumers after a new authoritative terrain revision.
 * Ground, planned crossing decks and inclined supports keep distinct surfaces;
 * the independent audit still decides whether their new slopes are admissible.
 */
export function refreshPlanningRouteHeights(plan: IslandPlan): void {
  const data = plan.planning;
  if (!data) return;
  const ground = createPlanningGroundSampler(plan);
  for (const port of data.ports) {
    if (port.kind === "water") continue;
    if (port.kind === "summit") {
      const rock = plan.rocks.find((rock) => rock.id === port.surfaceId);
      if (rock) port.height = (rock.baseHeight ?? ground(rock.center)) + rock.height;
    } else port.height = ground(port.position);
  }
  for (const route of plan.routes) {
    const profile = data.profiles.find((profile) => profile.kind === "route" && profile.ownerId === route.id);
    if (!profile) continue;
    if (route.kind === "ridge") {
      const support = plan.supports.find((support) => support.routeId === route.id),
        from = data.ports.find((port) => port.id === route.from),
        to = data.ports.find((port) => port.id === route.to);
      if (!support || !from || !to) continue;
      support.startHeight = from.height;
      support.endHeight = to.height;
      const dx = support.b.x - support.a.x,
        dz = support.b.z - support.a.z,
        length2 = dx * dx + dz * dz;
      for (const point of profile.points) {
        const t = Math.max(
          0,
          Math.min(1, ((point.x - support.a.x) * dx + (point.z - support.a.z) * dz) / (length2 || 1))
        );
        point.y = support.startHeight + (support.endHeight - support.startHeight) * t;
      }
      continue;
    }
    const bridges = plan.bridges.filter((bridge) => bridge.id.startsWith(`${route.id}-crossing-`));
    for (const point of profile.points) {
      point.y = ground(point);
      for (const bridge of bridges) {
        const dx = bridge.b.x - bridge.a.x,
          dz = bridge.b.z - bridge.a.z,
          length2 = dx * dx + dz * dz,
          t = ((point.x - bridge.a.x) * dx + (point.z - bridge.a.z) * dz) / (length2 || 1);
        if (t < 0 || t > 1 || distance(point, interpolate(bridge.a, bridge.b, t)) > 0.01) continue;
        point.y = ground(bridge.a) + (ground(bridge.b) - ground(bridge.a)) * t;
        break;
      }
    }
  }
}
