import { WALK_METRICS } from "../../semantic-study/PlanningWalk";
import { compileRoadPath, publishRoadPath, type RoadClearance } from "../layout/RoadGeometry";
import { reduceRoadNetwork } from "../layout/RoadNetworkReduction";
import { resolveRoadTopology, rebuildPhysicalRoadTopology } from "../layout/RoadTopology";
import type { IslandPlan, PlanPoint, PlanWater } from "../../semantic-study/IslandPlanModel";
import {
  createPlanningGroundSampler,
  createPlanningRingQuery,
  planningWaterHeight
} from "../../semantic-study/WorldPlanningTerrain";
import { ribbonOutline } from "../../semantic-study/WorldRibbon";
import { suspensionBridgePoint } from "@galacean/engine-water/bridges/SuspensionBridge";
import { bounds, type Bounds } from "../layout/Volumes";
const distance = (a: PlanPoint, b: PlanPoint) => Math.hypot(a.x - b.x, a.z - b.z);
// RingQuery.within is only an AABB broad phase, not distance to the river banks.
const nearWater = (ring: ReturnType<typeof createPlanningRingQuery>, p: PlanPoint, radius: number) =>
  ring.inside(p) || ring.distance(p, radius + 0.001) <= radius;

/** Local normal spans, clipped to the actual banks. A two-point river has the same crossing contract. */
function normalCrossingBanks(water: PlanWater, a: PlanPoint, b: PlanPoint, margin: number): [PlanPoint, PlanPoint][] {
  const line = water.centerline ?? [];
  if (line.length < 2) return [];
  const midpoint = { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 };
  const arcs = [0];
  let nearest = Infinity,
    station = 0;
  for (let i = 1; i < line.length; i++) {
    const p = line[i - 1],
      q = line[i],
      length = distance(p, q);
    arcs.push(arcs[i - 1] + length);
    if (length < 1e-6) continue;
    const t = Math.max(
      0,
      Math.min(1, ((midpoint.x - p.x) * (q.x - p.x) + (midpoint.z - p.z) * (q.z - p.z)) / (length * length))
    );
    const gap = distance(midpoint, { x: p.x + (q.x - p.x) * t, z: p.z + (q.z - p.z) * t });
    if (gap < nearest) {
      nearest = gap;
      station = arcs[i - 1] + length * t;
    }
  }
  const tangent = (i: number) => {
    const p = line[Math.max(0, i - 1)],
      q = line[Math.min(line.length - 1, i + 1)];
    const length = distance(p, q) || 1;
    return { x: (q.x - p.x) / length, z: (q.z - p.z) / length };
  };
  const ring = createPlanningRingQuery(water.outline);
  const result: [PlanPoint, PlanPoint][] = [];
  // A fixed local set of stations; never resample the world or search the full river for a replacement.
  for (let offset = -64; offset <= 64; offset += 8) {
    const arc = station + offset;
    if (arc <= 1e-3 || arc >= arcs.at(-1)! - 1e-3) continue;
    const i = arcs.findIndex((s) => s >= arc),
      t = (arc - arcs[i - 1]) / (arcs[i] - arcs[i - 1]);
    const p = {
      x: line[i - 1].x + (line[i].x - line[i - 1].x) * t,
      z: line[i - 1].z + (line[i].z - line[i - 1].z) * t
    };
    if (!ring.inside(p)) continue;
    const u = tangent(i - 1),
      v = tangent(i);
    const tx = u.x + (v.x - u.x) * t,
      tz = u.z + (v.z - u.z) * t,
      length = Math.hypot(tx, tz);
    if (length < 1e-6) continue;
    const nx = -tz / length,
      nz = tx / length;
    let low = -Infinity,
      high = Infinity;
    for (let j = 0; j < water.outline.length; j++) {
      const c = water.outline[j],
        d = water.outline[(j + 1) % water.outline.length];
      const ex = d.x - c.x,
        ez = d.z - c.z,
        denominator = nx * ez - nz * ex;
      if (Math.abs(denominator) < 1e-9) continue;
      const dx = c.x - p.x,
        dz = c.z - p.z;
      const along = (dx * nz - dz * nx) / denominator;
      if (along < 0 || along > 1) continue;
      const hit = (dx * ez - dz * ex) / denominator;
      if (hit < 0) low = Math.max(low, hit);
      else high = Math.min(high, hit);
    }
    if (!Number.isFinite(low) || !Number.isFinite(high)) continue;
    const banks: [PlanPoint, PlanPoint] = [
      { x: p.x + nx * (low - margin), z: p.z + nz * (low - margin) },
      { x: p.x + nx * (high + margin), z: p.z + nz * (high + margin) }
    ];
    if (banks.every((bank) => !nearWater(ring, bank, margin / 2))) result.push(banks);
  }
  return result;
}

/** Immutable dry-bank crossing corridors available to road search. No bridges are published until used. */
export function riverRoadQueries(plan: IslandPlan) {
  const ground = createPlanningGroundSampler(plan),
    lands = [plan.land, ...plan.islands].map(createPlanningRingQuery);
  return plan.waters.map((w) => {
    const water = createPlanningRingQuery(w.outline),
      points = w.centerline ?? [],
      corridors: ReturnType<typeof createPlanningRingQuery>[] = [];
    let arc = 0,
      last = -Infinity;
    for (let i = 1; i < points.length - 1; i++) {
      arc += distance(points[i - 1], points[i]);
      if (arc - last < 32) continue;
      const p = points[i],
        a = points[i - 1],
        b = points[i + 1],
        length = distance(a, b);
      if (length < 0.01) continue;
      const nx = -(b.z - a.z) / length,
        nz = (b.x - a.x) / length;
      const reach = (w.widths?.[i] ?? 12) / 2 + (w.bankWidthM ?? 12) + 8;
      const start = { x: p.x + nx * reach, z: p.z + nz * reach },
        end = { x: p.x - nx * reach, z: p.z - nz * reach };
      const outline = ribbonOutline([start, end], [24], { start: "butt", end: "butt" }, true);
      if (!lands.some((l) => l.containsPolygon(outline)) || water.inside(start) || water.inside(end)) continue;
      if (Math.abs(ground(start) - ground(end)) / Math.max(1, 2 * reach) > 0.3) continue;
      if (
        [start, end].some(
          (p) =>
            Math.hypot(
              ground({ x: p.x + 0.5, z: p.z }) - ground({ x: p.x - 0.5, z: p.z }),
              ground({ x: p.x, z: p.z + 0.5 }) - ground({ x: p.x, z: p.z - 0.5 })
            ) > 0.5
        )
      )
        continue;
      corridors.push(createPlanningRingQuery(outline));
      last = arc;
    }
    const blocked = (p: PlanPoint) => water.inside(p) && !corridors.some((c) => c.inside(p));
    const segmentBlocked = (a: PlanPoint, b: PlanPoint, radius = 0) => {
      if (!water.touchesSegment(a, b, radius)) return false;
      const length = distance(a, b),
        n = Math.max(1, Math.ceil(length)),
        nx = length ? -(b.z - a.z) / length : 1,
        nz = length ? (b.x - a.x) / length : 0;
      for (let i = 0; i <= n; i++)
        for (const side of [-1, 0, 1])
          if (
            blocked({
              x: a.x + ((b.x - a.x) * i) / n + nx * radius * side,
              z: a.z + ((b.z - a.z) * i) / n + nz * radius * side
            })
          )
            return true;
      return false;
    };
    return {
      id: w.id,
      ring: {
        ...water,
        touchesSegment: segmentBlocked,
        overlapsPolygon: (outline: PlanPoint[]) => {
          if (!water.overlapsPolygon(outline)) return false;
          if (outline.some((p, i) => segmentBlocked(p, outline[(i + 1) % outline.length]))) return true;
          const query = createPlanningRingQuery(outline);
          return w.outline.some((p) => query.inside(p) && blocked(p));
        }
      }
    };
  });
}

/** Move water-side junctions to a dry approach on their existing pavement.
 * Reuse that approach on every incident branch: no new search or cross-water
 * branch is introduced, and the crossing compiler then sees complete banks.
 */
function moveWaterJunctionsToBanks(plan: IslandPlan): boolean {
  const sections = plan.roadGraph?.sections;
  if (!sections) return false;
  const waters = plan.waters.map((w) => createPlanningRingQuery(w.outline));
  const wet = (p: PlanPoint) => waters.some((r) => r.inside(p));
  const dry = (p: PlanPoint) => waters.every((r) => !nearWater(r, p, 4));
  const key = (p: PlanPoint) => `${p.x.toFixed(5)},${p.z.toFixed(5)}`;
  const endpoints = sections.flatMap((s) => [s.route.points[0], s.route.points.at(-1)!]);
  const degree = new Map<string, number>();
  for (const point of endpoints) degree.set(key(point), (degree.get(key(point)) ?? 0) + 1);
  // A dry centre alone is insufficient: the branch needs room between the bank
  // and the bridge structure. Preserve ordinary dry terminals at their authored port.
  const pending = new Set(endpoints.filter((p) => wet(p) || (degree.get(key(p))! > 1 && !dry(p))).map(key));
  let changed = false;
  while (pending.size) {
    let moved = false;
    for (const junction of pending) {
      const incident = sections.flatMap((s) => {
        const r = s.route,
          forward = key(r.points[0]) === junction;
        if (!forward && key(r.points.at(-1)!) !== junction) return [];
        const original = forward ? r.points : r.points.slice().reverse();
        const originalWidths = r.widths ?? r.points.map(() => r.width);
        const orientedWidths = forward ? originalWidths : originalWidths.slice().reverse();
        const points: PlanPoint[] = [],
          widths: number[] = [];
        for (let i = 1; i < original.length; i++) {
          const a = original[i - 1],
            b = original[i],
            steps = Math.max(1, Math.ceil(distance(a, b)));
          for (let j = 0; j < steps; j++) {
            const t = j / steps;
            points.push({ x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t });
            widths.push(orientedWidths[i - 1] * (1 - t) + orientedWidths[i] * t);
          }
        }
        points.push(original.at(-1)!);
        widths.push(orientedWidths.at(-1)!);
        return [{ route: r, forward, points, widths }];
      });
      const options = incident
        .flatMap((edge) => {
          let at = edge.points.findIndex(dry);
          if (at < 0) return [];
          if (at === edge.points.length - 1) {
            // Keep a nonzero final edge even for a two-point bank approach.
            const a = edge.points[at - 1],
              b = edge.points[at];
            let low = 0,
              high = 1;
            for (let i = 0; i < 20; i++) {
              const t = (low + high) / 2;
              if (dry({ x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t })) high = t;
              else low = t;
            }
            const t = (high + 1) / 2;
            edge.points.splice(at, 0, { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t });
            edge.widths.splice(at, 0, edge.widths[at - 1] * (1 - t) + edge.widths[at] * t);
          }
          let length = 0;
          for (let i = 1; i <= at; i++) length += distance(edge.points[i - 1], edge.points[i]);
          return [{ edge, at, length }];
        })
        .sort((a, b) => a.length - b.length || a.edge.route.id.localeCompare(b.edge.route.id));
      const choice = options[0];
      if (!choice) continue;
      const approach = choice.edge.points.slice(0, choice.at + 1).reverse();
      const approachWidths = choice.edge.widths.slice(0, choice.at + 1).reverse();
      for (const edge of incident) {
        let points: PlanPoint[], widths: number[];
        if (edge === choice.edge) {
          points = edge.points.slice(choice.at);
          widths = edge.widths.slice(choice.at);
        } else {
          points = [...approach, ...edge.points.slice(1)];
          widths = [...approachWidths.map((w) => Math.min(w, edge.route.width)), ...edge.widths.slice(1)];
        }
        if (!edge.forward) {
          points.reverse();
          widths.reverse();
        }
        Object.assign(edge.route, publishRoadPath({ ...edge.route, widths, keypoints: undefined }, points));
      }
      pending.delete(junction);
      moved = changed = true;
    }
    // A component with no dry pavement cannot provide a bank attachment.
    if (!moved) break;
  }
  return changed;
}

/** Resolve bank-to-bank geometry before final branch attachment; crossing changes can move junctions. */
export function straightenRiverCrossings(plan: IslandPlan, clear: RoadClearance, keypointsOnly = false): void {
  const priorPaths = new Map(plan.roadGraph?.sections.map((s) => [s.id, s.route.points]));
  let changed = moveWaterJunctionsToBanks(plan);
  const roads = plan.roadGraph?.sections.map((s) => s.route) ?? plan.routes;
  const crossings = new Map<string, [PlanPoint, PlanPoint][]>();
  const sample = (keys: PlanPoint[]) => {
    const result: PlanPoint[] = [];
    for (let j = 1; j < keys.length; j++) {
      const a = keys[j - 1],
        b = keys[j],
        n = Math.max(1, Math.ceil(distance(a, b)));
      for (let k = 0; k < n; k++) result.push({ x: a.x + ((b.x - a.x) * k) / n, z: a.z + ((b.z - a.z) * k) / n });
    }
    result.push(keys.at(-1)!);
    return result;
  };
  for (const road of roads) {
    let points = road.points;
    const fittedWidths = new WeakMap<PlanPoint, number>();
    for (const water of plan.waters) {
      const ring = createPlanningRingQuery(water.outline);
      const sampled: PlanPoint[] = [];
      for (let i = 1; i < points.length; i++) {
        const a = points[i - 1],
          b = points[i],
          n = Math.max(1, Math.ceil(distance(a, b)));
        for (let k = 0; k < n; k++) sampled.push({ x: a.x + ((b.x - a.x) * k) / n, z: a.z + ((b.z - a.z) * k) / n });
      }
      if (points.length) sampled.push(points.at(-1)!);
      let replaced = false;
      const replaceCrossing = (first: number, last: number, keys: PlanPoint[]) => {
        if (keypointsOnly) {
          const replacement = sample(keys);
          sampled.splice(first, last - first + 1, ...replacement);
          return first + replacement.length - 1;
        }
        const [u, v] = keys.length === 4 ? keys.slice(1, 3) : keys;
        const span = distance(u, v) || 1;
        const heading = { x: (v.x - u.x) / span, z: (v.z - u.z) / span };
        const reach = Math.max(12, road.width * 3, distance(sampled[first], u), distance(sampled[last], v));
        let start = first,
          end = last,
          walked = 0;
        while (start > 0 && walked < reach && !ring.inside(sampled[start - 1])) {
          walked += distance(sampled[start], sampled[start - 1]);
          start--;
        }
        walked = 0;
        while (end + 1 < sampled.length && walked < reach && !ring.inside(sampled[end + 1])) {
          walked += distance(sampled[end], sampled[end + 1]);
          end++;
        }
        const direction = (a: PlanPoint, b: PlanPoint) => {
          const length = distance(a, b) || 1;
          return { x: (b.x - a.x) / length, z: (b.z - a.z) / length };
        };
        const dry = (path: PlanPoint[], outline: PlanPoint[]) => !ring.overlapsPolygon(outline) && clear(path, outline);
        const needsBefore = distance(sampled[start], u) > 1e-5;
        const needsAfter = distance(v, sampled[end]) > 1e-5;
        const before = needsBefore
          ? compileRoadPath(
              { id: road.id + ":bank-in", from: road.from, to: road.to, width: road.width },
              [sampled[start], u],
              dry,
              0.25,
              1,
              { start: direction(sampled[start], sampled[start + 1]), end: heading }
            )
          : undefined;
        const after = needsAfter
          ? compileRoadPath(
              { id: road.id + ":bank-out", from: road.from, to: road.to, width: road.width },
              [v, sampled[end]],
              dry,
              0.25,
              1,
              { start: heading, end: direction(sampled[end - 1], sampled[end]) }
            )
          : undefined;
        // Fit dry approaches to the bridge direction. The water span itself stays
        // a single straight bank-to-bank connection with its exact endpoints.
        if ((needsBefore && !before) || (needsAfter && !after)) {
          const replacement = sample(keys);
          sampled.splice(first, last - first + 1, ...replacement);
          return first + replacement.length - 1;
        }
        for (const route of [before, after]) route?.points.forEach((p, i) => fittedWidths.set(p, route.widths![i]));
        const replacement = [
          ...(before?.points.slice(0, -1) ?? []),
          ...sample([u, v]),
          ...(after?.points.slice(1) ?? [])
        ];
        sampled.splice(start, end - start + 1, ...replacement);
        return start + replacement.length - 1;
      };
      for (let i = 0; i < sampled.length; i++) {
        if (!ring.inside(sampled[i])) continue;
        let first = i;
        while (i + 1 < sampled.length && nearWater(ring, sampled[i + 1], 4)) i++;
        let last = i;
        while (first > 0 && nearWater(ring, sampled[first], 4)) first--;
        if (last + 1 < sampled.length) last++;
        const a = sampled[first],
          b = sampled[last];
        if (ring.inside(a) || ring.inside(b) || distance(a, b) < 1) continue;
        const shared = crossings.get(water.id) ?? [];
        let joined: PlanPoint[] | undefined;
        for (const pair of shared) {
          if (
            distance(
              { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 },
              { x: (pair[0].x + pair[1].x) / 2, z: (pair[0].z + pair[1].z) / 2 }
            ) > 64
          )
            continue;
          for (const [u, v] of [pair, pair.slice().reverse()]) {
            if (ring.touchesSegment(a, u, road.width / 2) || ring.touchesSegment(v, b, road.width / 2)) continue;
            const keys = [a, u, v, b];
            if (
              !keys
                .slice(1)
                .every((q, k) =>
                  clear([keys[k], q], ribbonOutline([keys[k], q], [road.width], { start: "butt", end: "butt" }, true))
                )
            )
              continue;
            joined = keys;
            break;
          }
          if (joined) break;
        }
        if (joined) {
          i = replaceCrossing(first, last, joined);
          replaced = true;
          continue;
        }
        // A clear oblique chord is not a preferred bridge. Establish a local
        // normal span first, then let the dry approaches absorb the change.
        let best: PlanPoint[] | undefined,
          cost = Infinity;
        const neighboringSegments = roads
          .filter((other) => other !== road)
          .flatMap((other) =>
            other.points.slice(1).flatMap((b, i) => {
              const a = other.points[i];
              return ring.touchesSegment(a, b, 0) || ring.inside(a) || ring.inside(b) ? [] : [{ a, b }];
            })
          );
        for (const banks of normalCrossingBanks(water, a, b, Math.max(4, road.width / 2 + 0.5))) {
          const footprint = ribbonOutline(banks, [road.maxWidth ?? road.width], { start: "butt", end: "butt" }, true);
          // A guarded bridge cannot double as a junction with an existing dry road.
          const corridor = createPlanningRingQuery(footprint);
          if (neighboringSegments.some(({ a, b }) => corridor.touchesSegment(a, b, WALK_METRICS.radius + 0.05)))
            continue;
          for (const [u, v] of [banks, banks.slice().reverse()]) {
            const length = distance(a, u) + distance(u, v) + distance(v, b);
            if (
              length >= cost ||
              ring.touchesSegment(a, u, road.width / 2) ||
              ring.touchesSegment(v, b, road.width / 2)
            )
              continue;
            const keys = [a, u, v, b];
            if (
              !keys
                .slice(1)
                .every((q, k) =>
                  clear([keys[k], q], ribbonOutline([keys[k], q], [road.width], { start: "butt", end: "butt" }, true))
                )
            )
              continue;
            best = keys;
            cost = length;
          }
        }
        if (best) {
          shared.push([best[1], best[2]]);
          crossings.set(water.id, shared);
          i = replaceCrossing(first, last, best);
          replaced = true;
          continue;
        }
        // Preserve a usable crossing if every nearby normal span is obstructed.
        const outline = ribbonOutline([a, b], [road.width], { start: "butt", end: "butt" }, true);
        if (!clear([a, b], outline)) continue;
        shared.push([a, b]);
        crossings.set(water.id, shared);
        i = replaceCrossing(first, last, [a, b]);
        replaced = true;
      }
      if (replaced) {
        points = sampled;
        changed = true;
      }
    }
    if (keypointsOnly) {
      // Sampling finds exact bank transitions; only turns and bank endpoints become
      // graph keys. Collinear metre samples are not topology or spline control nodes.
      const compact: PlanPoint[] = [];
      for (const p of points) {
        while (compact.length > 1) {
          const a = compact[compact.length - 2],
            b = compact[compact.length - 1];
          const ux = b.x - a.x,
            uz = b.z - a.z,
            vx = p.x - b.x,
            vz = p.z - b.z;
          if (
            Math.abs(ux * vz - uz * vx) > 1e-7 * Math.max(1, Math.hypot(ux, uz) + Math.hypot(vx, vz)) ||
            ux * vx + uz * vz < 0
          )
            break;
          compact.pop();
        }
        compact.push(p);
      }
      Object.assign(road, publishRoadPath({ ...road, widths: undefined, keypoints: undefined }, compact));
    } else if (points !== road.points) {
      const widths = points.map((p) => {
        const fitted = fittedWidths.get(p);
        if (fitted !== undefined) return fitted;
        let best = Infinity,
          width = road.width;
        for (let i = 1; i < road.points.length; i++) {
          const a = road.points[i - 1],
            b = road.points[i],
            dx = b.x - a.x,
            dz = b.z - a.z;
          const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / (dx * dx + dz * dz || 1)));
          const gap = Math.hypot(p.x - a.x - dx * t, p.z - a.z - dz * t);
          if (gap < best) {
            best = gap;
            const wa = road.widths?.[i - 1] ?? road.width,
              wb = road.widths?.[i] ?? road.width;
            width = wa + (wb - wa) * t;
          }
        }
        return width;
      });
      Object.assign(road, publishRoadPath({ ...road, widths, keypoints: undefined }, points));
    }
  }
  // Split intersections again without applying spline curvature to bridge spans.
  if (changed) {
    if (plan.roadGraph) {
      // Shared bank approaches may now intersect twice. Resolve those new narrow
      // cycles before final branch attachment; preserve the logical destinations.
      if (rebuildPhysicalRoadTopology(plan, clear, priorPaths)) reduceRoadNetwork(plan, clear);
    } else resolveRoadTopology(plan, clear, false);
  }
}

/** Publish bridge decks only where final road geometry actually crosses water.
 * Each segment is a horizontal OBB; deck heights interpolate through dry-bank approaches.
 */
export function publishRiverCrossings(plan: IslandPlan, clear?: RoadClearance): void {
  plan.bridges = [];
  plan.roadApproaches = [];
  if (!plan.waters.length) return;
  if (clear) straightenRiverCrossings(plan, clear);
  const ground = createPlanningGroundSampler(plan);
  const waters = plan.waters.map((w) => ({ w, ring: createPlanningRingQuery(w.outline) }));
  const roads = plan.roadGraph?.sections.map((s) => s.route) ?? plan.routes;
  type Node = {
    p: PlanPoint;
    floor: number;
    y: number;
    active: boolean;
    width: number;
    riverId: string;
    edges: Map<number, number>;
  };
  const nodes: Node[] = [],
    ids = new Map<string, number>();
  const add = (p: PlanPoint) => {
    const key = p.x.toFixed(5) + ":" + p.z.toFixed(5);
    let id = ids.get(key);
    if (id === undefined) {
      id = nodes.length;
      ids.set(key, id);
      const floor = ground(p);
      nodes.push({ p, floor, y: floor, active: false, width: 0, riverId: "", edges: new Map() });
    }
    return id;
  };
  const sections = roads.map((road, index) => {
    const path: number[] = [];
    for (let j = 1; j < road.points.length; j++) {
      const a = road.points[j - 1],
        b = road.points[j],
        steps = Math.max(1, Math.ceil(distance(a, b)));
      for (let k = 0; k < steps; k++)
        path.push(add({ x: a.x + ((b.x - a.x) * k) / steps, z: a.z + ((b.z - a.z) * k) / steps }));
    }
    if (road.points.length) path.push(add(road.points.at(-1)!));
    for (let i = 1; i < path.length; i++) {
      const a = path[i - 1],
        b = path[i],
        length = distance(nodes[a].p, nodes[b].p);
      nodes[a].edges.set(b, length);
      nodes[b].edges.set(a, length);
    }
    for (const id of path) nodes[id].width = Math.max(nodes[id].width, road.maxWidth ?? road.width);
    return { road, path, id: plan.roadGraph?.sections[index].id ?? road.id };
  });
  // Deck ribbons can touch before their centre lines intersect. Their support
  // heights must agree too, otherwise adjacent branches create a vertical lip.
  const bins = new Map<string, number[]>();
  for (let id = 0; id < nodes.length; id++) {
    const p = nodes[id].p,
      key = Math.floor(p.x / 8) + ":" + Math.floor(p.z / 8);
    bins.set(key, [...(bins.get(key) ?? []), id]);
  }
  const maxWidth = Math.max(0, ...nodes.map((n) => n.width));
  for (let id = 0; id < nodes.length; id++) {
    const n = nodes[id],
      radius = (n.width + maxWidth) / 2 + 1;
    if (!waters.some(({ w, ring }) => nearWater(ring, n.p, (w.bankWidthM ?? 12) + radius + 12))) continue;
    for (let z = Math.floor((n.p.z - radius) / 8); z <= Math.floor((n.p.z + radius) / 8); z++)
      for (let x = Math.floor((n.p.x - radius) / 8); x <= Math.floor((n.p.x + radius) / 8); x++)
        for (const other of bins.get(x + ":" + z) ?? []) {
          if (other <= id) continue;
          const b = nodes[other],
            length = distance(n.p, b.p);
          if (length <= (n.width + b.width) / 2 + 1) {
            n.edges.set(other, length);
            b.edges.set(id, length);
          }
        }
  }
  const queue: { id: number; y: number }[] = [];
  const push = (id: number) => {
    const item = { id, y: nodes[id].y };
    let i = queue.length;
    queue.push(item);
    while (i) {
      const parent = (i - 1) >> 1;
      if (queue[parent].y >= item.y) break;
      queue[i] = queue[parent];
      i = parent;
    }
    queue[i] = item;
  };
  const pop = () => {
    const result = queue[0],
      last = queue.pop()!;
    if (queue.length) {
      let i = 0;
      while (i * 2 + 1 < queue.length) {
        let child = i * 2 + 1;
        if (child + 1 < queue.length && queue[child + 1].y > queue[child].y) child++;
        if (queue[child].y <= last.y) break;
        queue[i] = queue[child];
        i = child;
      }
      queue[i] = last;
    }
    return result;
  };
  for (const { road, path } of sections)
    for (const { w, ring } of waters) {
      if (!path.some((id) => ring.inside(nodes[id].p))) continue;
      for (let i = 0; i < path.length; i++) {
        const node = nodes[path[i]];
        if (!nearWater(ring, node.p, (w.bankWidthM ?? 12) + 8)) continue;
        const a = nodes[path[Math.max(0, i - 1)]].p,
          b = nodes[path[Math.min(path.length - 1, i + 1)]].p,
          length = distance(a, b) || 1;
        const half = (road.maxWidth ?? road.width) / 2,
          nx = -(b.z - a.z) / length,
          nz = (b.x - a.x) / length;
        node.y = Math.max(
          node.y,
          planningWaterHeight(plan, w.id, node.p)! + 1,
          ground({ x: node.p.x + nx * half, z: node.p.z + nz * half }) + 0.05,
          ground({ x: node.p.x - nx * half, z: node.p.z - nz * half }) + 0.05
        );
        node.active = true;
        node.riverId = w.id;
        push(path[i]);
      }
    }
  // One grade envelope on the shared graph. At a branch there is one support
  // height, not several independently fitted bridge decks stacked on each other.
  while (queue.length) {
    const { id, y } = pop(),
      node = nodes[id];
    if (y < node.y - 1e-6) continue;
    for (const [next, length] of node.edges) {
      const target = nodes[next],
        height = y - length * 0.25;
      if (height > target.y + 1e-6) {
        target.y = height;
        target.active = true;
        target.riverId = node.riverId;
        push(next);
      }
    }
  }
  for (const { road, path, id } of sections)
    for (let i = 0; i < path.length; i++) {
      if (!nodes[path[i]].active) continue;
      const isDeck = (at: number) => waters.some(({ ring }) => nearWater(ring, nodes[path[at]].p, 2));
      const crossing = isDeck(i);
      const first = i;
      while (i + 1 < path.length && nodes[path[i + 1]].active && isDeck(i + 1) === crossing) i++;
      const start = Math.max(0, first - 1),
        end = Math.min(path.length - 1, i + 1);
      if (end <= start) continue;
      const deckPath = path.slice(start, end + 1).map((id) => ({ ...nodes[id].p, y: nodes[id].y }));
      (crossing && deckPath.some((p) => waters.some(({ ring }) => ring.inside(p)))
        ? plan.bridges
        : plan.roadApproaches
      ).push({
        id: `bridge:${road.id}:${first}`,
        label: "跨河连接",
        riverId: nodes[path[first]].riverId,
        routeId: road.id,
        roadSectionIds: [id],
        a: deckPath[0],
        b: deckPath.at(-1)!,
        width: road.maxWidth ?? road.width,
        deckY: Math.max(...deckPath.map((p) => p.y)),
        deckPath
      });
    }
  // A physical junction can split one straight bridge into several sections.
  // Publish a whole bank-to-bank deck rather than supports ending in the water.
  const pending = plan.bridges,
    joined: typeof pending = [],
    visited = new Set<number>();
  const ends = new Map<string, number[]>();
  const key = (p: PlanPoint) => `${p.x.toFixed(5)},${p.z.toFixed(5)}`;
  pending.forEach((b, i) => {
    for (const p of [b.a, b.b]) ends.set(key(p), [...(ends.get(key(p)) ?? []), i]);
  });
  for (let i = 0; i < pending.length; i++) {
    if (visited.has(i)) continue;
    visited.add(i);
    const bridge = pending[i],
      path = bridge.deckPath!.slice(),
      roadSectionIds = bridge.roadSectionIds!.slice();
    let width = bridge.width;
    const ring = waters.find((w) => w.w.id === bridge.riverId)!.ring;
    for (const front of [false, true]) {
      while (ring.inside(front ? path[0] : path.at(-1)!)) {
        const end = front ? path[0] : path.at(-1)!;
        const prior = front ? path[1] : path.at(-2)!;
        const candidate = (ends.get(key(end)) ?? []).find((j) => {
          if (visited.has(j) || pending[j].riverId !== bridge.riverId) return false;
          const b = pending[j],
            other = key(b.a) === key(end) ? b.b : b.a;
          const dx = end.x - prior.x,
            dz = end.z - prior.z,
            length = Math.hypot(dx, dz) || 1;
          return (
            (other.x - end.x) * dx + (other.z - end.z) * dz > 0 &&
            b.deckPath!.every((p) => Math.abs((p.x - end.x) * dz - (p.z - end.z) * dx) / length < 0.019)
          );
        });
        if (candidate === undefined) break;
        visited.add(candidate);
        const b = pending[candidate];
        width = Math.max(width, b.width);
        const outward = key(b.a) === key(end) ? b.deckPath! : b.deckPath!.slice().reverse();
        if (front) {
          path.unshift(...outward.slice(1).reverse());
          roadSectionIds.unshift(...b.roadSectionIds!);
        } else {
          path.push(...outward.slice(1));
          roadSectionIds.push(...b.roadSectionIds!);
        }
      }
    }
    joined.push({
      ...bridge,
      roadSectionIds,
      a: path[0],
      b: path.at(-1)!,
      width,
      deckPath: path,
      deckY: Math.max(...path.map((p) => p.y))
    });
  }
  const ordinals = new Map<string, number>();
  plan.bridges = joined.map((bridge) => {
    const key = `${bridge.routeId}:${bridge.riverId}`,
      ordinal = ordinals.get(key) ?? 0;
    ordinals.set(key, ordinal + 1);
    return { ...bridge, id: `bridge:${key}:${ordinal}` };
  });
}

const bridgeQueryBlockSize = 16;
const insideBridgeBounds = (box: Bounds, p: PlanPoint) =>
  p.x >= box.x0 && p.x <= box.x1 && p.z >= box.z0 && p.z <= box.z1;

/** Overlay a published plan snapshot for walking only. Conservative bounds reject
 * unrelated geometry; surviving segments/triangles retain their original order,
 * tolerances and arithmetic. Rebuild this sampler when publishing a new plan. */
export function bridgeGround(
  plan: Pick<IslandPlan, "bridges" | "roadApproaches">,
  ground: (p: PlanPoint) => number
): (p: PlanPoint) => number {
  const decks = (plan.bridges ?? []).map((b) => {
    const points =
      b.deckPath ??
      (b.deckY === undefined
        ? []
        : [
            { ...b.a, y: b.deckY },
            { ...b.b, y: b.deckY }
          ]);
    const radius = b.width / 2 + 0.001;
    const segments = points
      .slice(1)
      .map((q, i) => ({
        a: points[i],
        b: q,
        minX: Math.min(points[i].x, q.x) - radius,
        minZ: Math.min(points[i].z, q.z) - radius,
        maxX: Math.max(points[i].x, q.x) + radius,
        maxZ: Math.max(points[i].z, q.z) + radius
      }));
    const segmentBlocks = [];
    // Include the legacy weighted fringe, which extends beyond the solid deck.
    const margin = b.width / 2 + 0.002;
    for (let i = 0; i < segments.length; i += bridgeQueryBlockSize) {
      segmentBlocks.push({
        bounds: bounds(points.slice(i, i + bridgeQueryBlockSize + 1), margin),
        segments: segments.slice(i, i + bridgeQueryBlockSize)
      });
    }
    const boxes = segmentBlocks.map((block) => block.bounds);
    const box = bounds(
      boxes.flatMap((box) => [
        { x: box.x0, z: box.z0 },
        { x: box.x1, z: box.z1 }
      ])
    );
    return { width: b.width, suspension: b.suspension, bounds: box, segmentBlocks };
  });
  return (p) => {
    const groundY = ground(p);
    let weight = 0,
      height = 0,
      curvedHeight = -Infinity;
    for (const deck of decks) {
      if (!insideBridgeBounds(deck.bounds, p)) continue;
      let nearest = Infinity,
        level = 0;
      for (const block of deck.segmentBlocks) {
        if (!insideBridgeBounds(block.bounds, p)) continue;
        for (const d of block.segments) {
          if (p.x < d.minX || p.x > d.maxX || p.z < d.minZ || p.z > d.maxZ) continue;
          const dx = d.b.x - d.a.x,
            dz = d.b.z - d.a.z;
          const t = Math.max(0, Math.min(1, ((p.x - d.a.x) * dx + (p.z - d.a.z) * dz) / (dx * dx + dz * dz || 1)));
          const gap = Math.hypot(p.x - d.a.x - dx * t, p.z - d.a.z - dz * t);
          if (gap < nearest) {
            nearest = gap;
            level = d.a.y + (d.b.y - d.a.y) * t;
          }
        }
      }
      if (deck.suspension) {
        const { a, b } = deck.suspension,
          dx = b.x - a.x,
          dz = b.z - a.z;
        const rawT = ((p.x - a.x) * dx + (p.z - a.z) * dz) / (dx * dx + dz * dz);
        if (rawT < -1e-8 || rawT > 1 + 1e-8 || nearest > deck.width / 2 + 1e-6) continue;
        const t = Math.max(0, Math.min(1, rawT));
        level = suspensionBridgePoint(deck.suspension, t).y;
        if (rawT >= -1e-8 && rawT <= 1 + 1e-8 && nearest <= deck.width / 2 + 1e-6)
          curvedHeight = Math.max(curvedHeight, level);
      }
      const t = Math.max(0, 1 - nearest / (deck.width / 2 + 0.001)),
        w = t * t * (3 - 2 * t);
      weight += w;
      height += level * w;
    }
    return curvedHeight > -Infinity
      ? Math.max(groundY, curvedHeight)
      : weight > 1e-8
        ? Math.max(groundY, height / weight)
        : groundY;
  };
}
