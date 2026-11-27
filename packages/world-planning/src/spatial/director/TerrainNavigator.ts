import type { IslandPlan, PlanPoint } from "../../semantic-study/IslandPlanModel";
import { planningGroundSurface } from "../../semantic-study/PlanningHeightmap";
import { TraversalSurface } from "./TraversalSurface";
import type { DirectorRoute } from "./DirectorRoute";
import settings from "./navigation.json";

export type DirectorEndpoint = { kind: "point"; position: PlanPoint } | { kind: "poi"; id: string };
export class NavigationError extends Error {
  constructor(
    readonly code: "invalid-endpoint" | "budget" | "sampled-disconnected",
    message: string
  ) {
    super(message);
  }
}
const distance = (a: PlanPoint, b: PlanPoint) => Math.hypot(b.x - a.x, b.z - a.z);
/** A bounded immutable navigation snapshot. The grid proposes corridors; actual walking verifies the result. */
export class TerrainNavigator {
  readonly surface: TraversalSurface;
  private width: number;
  private depth: number;
  private validity: Int8Array;
  private road: Int8Array;
  constructor(
    readonly plan: IslandPlan,
    readonly limits = settings,
    ground = planningGroundSurface(plan).sample
  ) {
    if (!(limits.cellM > 0) || !(limits.maxExpandedNodes > 0)) throw new Error("导航预算无效");
    this.width = Math.ceil(plan.parameters.width / limits.cellM) + 1;
    this.depth = Math.ceil(plan.parameters.depth / limits.cellM) + 1;
    if (this.width * this.depth > limits.maxGridCells) throw new NavigationError("budget", "地图超出导航格网预算");
    this.validity = new Int8Array(this.width * this.depth);
    this.road = new Int8Array(this.validity.length);
    this.surface = new TraversalSurface(plan, ground);
  }
  resolve(endpoint: DirectorEndpoint): PlanPoint {
    if (endpoint.kind === "point") {
      const issue = this.surface.issue(endpoint.position);
      if (issue) throw new NavigationError("invalid-endpoint", `所选地表点不可站立：${issue}`);
      return { ...endpoint.position };
    }
    const site = this.plan.poiDistribution?.sites.find((s) => s.id === endpoint.id);
    if (!site) throw new NavigationError("invalid-endpoint", "兴趣点已不存在");
    const ports = (this.plan.roadNetwork?.nodes ?? []).filter((n) => n.poiId === site.id).map((n) => n.position);
    for (const p of [...ports, site.center]) if (!this.surface.issue(p)) return { ...p };
    // This search only belongs to the POI shortcut. Explicit picked coordinates are never moved.
    for (let r = this.limits.cellM; r <= this.limits.endpointSearchM; r += this.limits.cellM) {
      const count = Math.ceil((Math.PI * 2 * r) / this.limits.cellM);
      for (let i = 0; i < count; i++) {
        const p = {
          x: site.center.x + Math.cos((i * Math.PI * 2) / count) * r,
          z: site.center.z + Math.sin((i * Math.PI * 2) / count) * r
        };
        if (!this.surface.issue(p)) return p;
      }
    }
    throw new NavigationError("invalid-endpoint", "POI附近未找到可站立的接近点");
  }
  private point(id: number): PlanPoint {
    return { x: (id % this.width) * this.limits.cellM, z: Math.floor(id / this.width) * this.limits.cellM };
  }
  private valid(id: number): boolean {
    if (!this.validity[id]) this.validity[id] = this.surface.issue(this.point(id)) ? -1 : 1;
    return this.validity[id] > 0;
  }
  private cost(id: number): number {
    if (!this.road[id]) this.road[id] = this.surface.roadAt(this.point(id)) ? 1 : -1;
    return this.road[id] > 0 ? this.limits.roadCostMultiplier : 1;
  }
  route(from: DirectorEndpoint, to: DirectorEndpoint): DirectorRoute {
    const start = this.resolve(from),
      end = this.resolve(to);
    if (distance(start, end) < 0.2) throw new NavigationError("invalid-endpoint", "起终点过近");
    const attach = (p: PlanPoint) => {
      const result: number[] = [],
        cx = Math.round(p.x / this.limits.cellM),
        cz = Math.round(p.z / this.limits.cellM);
      for (let z = cz - 1; z <= cz + 1; z++)
        for (let x = cx - 1; x <= cx + 1; x++) {
          if (x < 0 || z < 0 || x >= this.width || z >= this.depth) continue;
          const id = z * this.width + x;
          if (this.valid(id) && this.surface.connects(p, this.point(id))) result.push(id);
        }
      return result;
    };
    const starts = attach(start),
      ends = new Set(attach(end));
    if (!starts.length || !ends.size)
      throw new NavigationError("sampled-disconnected", "端点可站立，但当前导航分辨率未找到接入通道");
    const costs = new Float64Array(this.validity.length).fill(Infinity),
      parents = new Int32Array(this.validity.length).fill(-1);
    const closed = new Uint8Array(this.validity.length),
      heap = new NavigationQueue();
    for (const id of starts) {
      costs[id] = distance(start, this.point(id));
      heap.push(id, costs[id] + distance(this.point(id), end) * this.limits.roadCostMultiplier);
    }
    let found = -1,
      expanded = 0;
    while (heap.length) {
      const id = heap.pop();
      if (closed[id]) continue;
      if (++expanded > this.limits.maxExpandedNodes)
        throw new NavigationError("budget", `已搜索${this.limits.maxExpandedNodes}个节点，预算内未找到路线`);
      closed[id] = 1;
      if (ends.has(id)) {
        found = id;
        break;
      }
      const x = id % this.width,
        z = Math.floor(id / this.width),
        p = this.point(id);
      for (let dz = -1; dz <= 1; dz++)
        for (let dx = -1; dx <= 1; dx++) {
          if ((!dx && !dz) || x + dx < 0 || z + dz < 0 || x + dx >= this.width || z + dz >= this.depth) continue;
          const next = id + dx + dz * this.width;
          if (closed[next] || !this.valid(next)) continue;
          const q = this.point(next),
            cost = costs[id] + (distance(p, q) * (this.cost(id) + this.cost(next))) / 2;
          if (cost >= costs[next] || !this.surface.connects(p, q)) continue;
          costs[next] = cost;
          parents[next] = id;
          heap.push(next, cost + distance(q, end) * this.limits.roadCostMultiplier);
        }
    }
    if (found < 0)
      throw new NavigationError(
        "sampled-disconnected",
        `当前${this.limits.cellM}米导航格网不连通；不等于证明所有路径都不存在`
      );
    const raw = [end];
    for (let id = found; id >= 0; id = parents[id]) raw.push(this.point(id));
    raw.push(start);
    raw.reverse();
    // Remove lattice zigzags locally, while retaining the chosen route's broad road preference.
    const points = [start];
    for (let i = 0; i < raw.length - 1; ) {
      let next = i + 1;
      for (let j = Math.min(raw.length - 1, i + 8); j > next; j--)
        if (this.surface.connects(raw[i], raw[j])) {
          next = j;
          break;
        }
      if (distance(points.at(-1)!, raw[next]) > 1e-5) points.push(raw[next]);
      i = next;
    }
    const key = (e: DirectorEndpoint) => (e.kind === "poi" ? e.id : `point:${e.position.x}:${e.position.z}`);
    const routeIds = [
      ...new Set(
        raw.flatMap((p) => {
          const id = this.surface.roadAt(p);
          return id ? [id] : [];
        })
      )
    ];
    return {
      id: `${key(from)}>${key(to)}`,
      from: key(from),
      to: key(to),
      points,
      routeIds,
      endpointMode: "exact",
      lengthM: points.slice(1).reduce((s, p, i) => s + distance(p, points[i]), 0)
    };
  }
}
/** Stable binary heap: equal scores retain node ordering, independent of wall-clock scheduling. */
class NavigationQueue {
  private data: { id: number; score: number }[] = [];
  get length() {
    return this.data.length;
  }
  private before(a: { id: number; score: number }, b: { id: number; score: number }) {
    return a.score < b.score || (a.score === b.score && a.id < b.id);
  }
  push(id: number, score: number) {
    const item = { id, score };
    let i = this.data.length;
    this.data.push(item);
    while (i) {
      const p = (i - 1) >> 1;
      if (!this.before(item, this.data[p])) break;
      this.data[i] = this.data[p];
      i = p;
    }
    this.data[i] = item;
  }
  pop(): number {
    const root = this.data[0],
      tail = this.data.pop()!;
    if (this.data.length) {
      let i = 0;
      while (i * 2 + 1 < this.data.length) {
        let child = i * 2 + 1;
        if (child + 1 < this.data.length && this.before(this.data[child + 1], this.data[child])) child++;
        if (!this.before(this.data[child], tail)) break;
        this.data[i] = this.data[child];
        i = child;
      }
      this.data[i] = tail;
    }
    return root.id;
  }
}
