import type { IslandPlan, PlanPoint } from "../../semantic-study/IslandPlanModel";
import { PlanningWalk } from "../../semantic-study/PlanningWalk";
import { planningGroundSurface } from "../../semantic-study/PlanningHeightmap";
import type { Observer } from "../guidance/VisibilityQuery";

export const DIRECTOR_CAMERA = {
  eyeHeightM: 1.65,
  verticalFovDegrees: 45,
  aspect: 16 / 9,
  lookBehindM: 2,
  lookAheadM: 3,
  nearM: 0.1
} as const;

export interface DirectorRoute {
  id: string;
  from: string;
  to: string;
  points: PlanPoint[];
  routeIds: string[];
  endpointMode?: "exact";
  lengthM: number;
}
export interface WalkFrame {
  distance: number;
  position: { x: number; y: number; z: number };
}
export interface WalkTrack {
  frames: WalkFrame[];
  reached: boolean;
  reason: string;
  lengthM: number;
  elapsedSeconds: number;
  speedMps: number;
}
export const distance = (a: PlanPoint, b: PlanPoint) => Math.hypot(a.x - b.x, a.z - b.z);
/** Published road polylines, split at real intersections. No straight-line shortcut through a POI. */
export class DirectorNetwork {
  private points: PlanPoint[] = [];
  private links = new Map<number, { to: number; cost: number; route: string }[]>();
  private anchors = new Map<string, number[]>();
  readonly connections: { from: string; to: string }[] = [];
  constructor(readonly plan: IslandPlan) {
    const routes = [
      ...plan.routes,
      ...plan.regions.flatMap((r) =>
        (r.navigationLinks ?? []).map((l, i) => ({ id: `${r.id}:nav:${i}`, points: l.points }))
      )
    ];
    const segments = routes
      .flatMap((r) => r.points.slice(1).map((b, i) => ({ a: r.points[i], b, id: r.id, cuts: [0, 1] })))
      .filter((s) => distance(s.a, s.b) > 1e-6);
    const bins = new Map<string, number[]>(),
      pairs = new Set<string>();
    for (const [i, s] of segments.entries())
      for (let x = Math.floor(Math.min(s.a.x, s.b.x) / 32); x <= Math.floor(Math.max(s.a.x, s.b.x) / 32); x++)
        for (let z = Math.floor(Math.min(s.a.z, s.b.z) / 32); z <= Math.floor(Math.max(s.a.z, s.b.z) / 32); z++) {
          const key = `${x}:${z}`,
            bucket = bins.get(key) ?? [];
          for (const j of bucket) pairs.add(`${j}:${i}`);
          bucket.push(i);
          bins.set(key, bucket);
        }
    for (const pair of pairs) {
      const [i, j] = pair.split(":").map(Number),
        a = segments[i],
        b = segments[j];
      const ux = a.b.x - a.a.x,
        uz = a.b.z - a.a.z,
        vx = b.b.x - b.a.x,
        vz = b.b.z - b.a.z,
        dx = b.a.x - a.a.x,
        dz = b.a.z - a.a.z,
        den = ux * vz - uz * vx;
      if (Math.abs(den) > 1e-8) {
        const t = (dx * vz - dz * vx) / den,
          u = (dx * uz - dz * ux) / den;
        if (t >= 0 && t <= 1 && u >= 0 && u <= 1) {
          a.cuts.push(t);
          b.cuts.push(u);
        }
      } else {
        for (const [s, p] of [
          [a, b.a],
          [a, b.b],
          [b, a.a],
          [b, a.b]
        ] as const) {
          const vx = s.b.x - s.a.x,
            vz = s.b.z - s.a.z,
            t = ((p.x - s.a.x) * vx + (p.z - s.a.z) * vz) / (vx * vx + vz * vz);
          if (t > 0 && t < 1 && distance(p, { x: s.a.x + t * vx, z: s.a.z + t * vz }) < 0.001) s.cuts.push(t);
        }
      }
    }
    const indices = new Map<string, number>();
    const node = (p: PlanPoint) => {
      const key = `${p.x.toFixed(3)}:${p.z.toFixed(3)}`;
      if (!indices.has(key)) {
        indices.set(key, this.points.length);
        this.points.push(p);
      }
      return indices.get(key)!;
    };
    for (const s of segments) {
      const cuts = [...new Set(s.cuts)].sort((a, b) => a - b);
      for (let i = 1; i < cuts.length; i++) {
        const point = (t: number) => ({ x: s.a.x + (s.b.x - s.a.x) * t, z: s.a.z + (s.b.z - s.a.z) * t });
        const a = node(point(cuts[i - 1])),
          b = node(point(cuts[i])),
          cost = distance(this.points[a], this.points[b]);
        for (const [from, to] of [
          [a, b],
          [b, a]
        ])
          this.links.set(from, [...(this.links.get(from) ?? []), { to, cost, route: s.id }]);
      }
    }
    for (const n of plan.roadNetwork?.nodes ?? []) {
      if (!n.poiId) continue;
      let closest = -1,
        best = 0.1;
      this.points.forEach((p, i) => {
        const d = distance(p, n.position);
        if (d < best) {
          best = d;
          closest = i;
        }
      });
      if (closest >= 0) this.anchors.set(n.poiId, [...(this.anchors.get(n.poiId) ?? []), closest]);
    }
    const seen = new Set<string>();
    for (const edge of plan.roadNetwork?.edges ?? []) {
      const a = plan.roadNetwork!.nodes.find((n) => n.id === edge.a)?.poiId,
        b = plan.roadNetwork!.nodes.find((n) => n.id === edge.b)?.poiId;
      if (!a || !b || a === b) continue;
      const key = [a, b].sort().join(":");
      if (!seen.has(key)) {
        seen.add(key);
        this.connections.push({ from: a, to: b });
      }
    }
  }
  /** Shortest road path between declared POI access points; throws for missing/disconnected access. */
  route(from: string, to: string): DirectorRoute {
    if (from === to) throw new Error("请选择不同的起终点");
    const starts = this.anchors.get(from),
      ends = new Set(this.anchors.get(to));
    if (!starts?.length || !ends.size) throw new Error("POI没有可用道路接入点：" + (!starts?.length ? from : to));
    const costs = new Map(starts.map((i) => [i, 0])),
      parents = new Map<number, { node: number; route: string }>(),
      pending = new Set(starts);
    let found = -1;
    while (pending.size) {
      let u = -1,
        best = Infinity;
      for (const n of pending)
        if (costs.get(n)! < best) {
          best = costs.get(n)!;
          u = n;
        }
      pending.delete(u);
      if (ends.has(u)) {
        found = u;
        break;
      }
      for (const e of this.links.get(u) ?? []) {
        const next = best + e.cost;
        if (next < (costs.get(e.to) ?? Infinity)) {
          costs.set(e.to, next);
          parents.set(e.to, { node: u, route: e.route });
          pending.add(e.to);
        }
      }
    }
    if (found < 0) throw new Error("实际路网不连通，不能直线穿越代替");
    const points = [this.points[found]],
      routeIds: string[] = [];
    let u = found;
    while (parents.has(u)) {
      const p = parents.get(u)!;
      routeIds.push(p.route);
      u = p.node;
      points.push(this.points[u]);
    }
    points.reverse();
    routeIds.reverse();
    return { id: `${from}>${to}`, from, to, points, routeIds: [...new Set(routeIds)], lengthM: costs.get(found)! };
  }
}
/** Fixed-step collision-checked trajectory; playback and machine sampling consume the identical positions. */
export function buildWalkTrack(plan: IslandPlan, route: DirectorRoute, speedMps = 4): WalkTrack {
  if (!Number.isFinite(speedMps) || speedMps < 1 || speedMps > 20) throw new Error("速度须在1–20米/秒");
  const walker = new PlanningWalk(plan, planningGroundSurface(plan).sample);
  walker.metrics.walk = speedMps;
  const lengths = route.points.slice(1).map((p, i) => distance(p, route.points[i]));
  const at = (s: number) => {
    let left = s;
    for (let i = 0; i < lengths.length; i++) {
      if (left <= lengths[i] || i === lengths.length - 1) {
        const t = Math.min(1, left / (lengths[i] || 1)),
          a = route.points[i],
          b = route.points[i + 1];
        return { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t };
      }
      left -= lengths[i];
    }
    return route.points[0];
  };
  const inset = route.endpointMode === "exact" ? 0 : Math.min(3, route.lengthM * 0.08),
    frames: WalkFrame[] = [];
  if (!walker.resetOnGround(at(inset)))
    return { frames, reached: false, reason: "起点无法在地表站立", lengthM: 0, elapsedSeconds: 0, speedMps };
  frames.push({ distance: 0, position: { ...walker.position } });
  let traveled = 0,
    steps = 0,
    stalled = 0;
  const limit = Math.ceil((route.lengthM / speedMps) * 60 * 2) + 600;
  for (
    let s = Math.min(inset + 1, route.lengthM - inset);
    s <= route.lengthM - inset + 1e-6;
    s = Math.min(route.lengthM - inset, s + 1)
  ) {
    const target = at(s);
    while (distance(walker.position, target) > 0.1) {
      if (++steps > limit || stalled > 60)
        return {
          frames,
          reached: false,
          reason: stalled > 60 ? "路线被实体或地势阻挡" : "实走预算耗尽",
          lengthM: traveled,
          elapsedSeconds: walker.elapsed,
          speedMps
        };
      const before = { ...walker.position },
        d = distance(before, target);
      walker.advance(
        Math.min(1 / 60, d / speedMps),
        (target.x - before.x) / d,
        (target.z - before.z) / d,
        false,
        false
      );
      const moved = distance(before, walker.position);
      stalled = moved < 1e-5 ? stalled + 1 : 0;
      traveled += moved;
      frames.push({ distance: traveled, position: { ...walker.position } });
    }
    if (s >= route.lengthM - inset) break;
  }
  return {
    frames,
    reached: true,
    reason: route.endpointMode === "exact" ? "实际行走到达所选终点" : "通过（门口内缩3米）",
    lengthM: traveled,
    elapsedSeconds: walker.elapsed,
    speedMps
  };
}
/** Arc-length interpolation and spatial look-ahead, independent of wall-clock playback history. */
export function trackObserver(track: WalkTrack, s: number): Observer {
  if (!track.frames.length) throw new Error("没有可观察的实走轨迹");
  const at = (value: number) => {
    value = Math.max(0, Math.min(track.lengthM, value));
    let lo = 0,
      hi = track.frames.length - 1;
    while (lo < hi) {
      const m = (lo + hi) >> 1;
      if (track.frames[m].distance < value) lo = m + 1;
      else hi = m;
    }
    const b = track.frames[lo],
      a = track.frames[Math.max(0, lo - 1)],
      t = (value - a.distance) / Math.max(1e-8, b.distance - a.distance);
    return {
      x: a.position.x + (b.position.x - a.position.x) * t,
      y: a.position.y + (b.position.y - a.position.y) * t,
      z: a.position.z + (b.position.z - a.position.z) * t
    };
  };
  const p = at(s),
    a = at(s - DIRECTOR_CAMERA.lookBehindM),
    b = at(s + DIRECTOR_CAMERA.lookAheadM),
    d = distance(a, b) || 1;
  return {
    position: { ...p, y: p.y + DIRECTOR_CAMERA.eyeHeightM },
    forward: { x: (b.x - a.x) / d, y: 0, z: (b.z - a.z) / d },
    verticalFovDegrees: DIRECTOR_CAMERA.verticalFovDegrees,
    aspect: DIRECTOR_CAMERA.aspect,
    columns: 320,
    rows: 180,
    terrainStepM: 2,
    nearM: 0.1
  };
}
