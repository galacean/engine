import limits from "../../planning-data/road-network.json";
import type { PlanPoint } from "../../semantic-study/IslandPlanModel";

const distance = (a: PlanPoint, b: PlanPoint) => Math.hypot(a.x - b.x, a.z - b.z);

interface TerrainRoadGrid {
  columns: number;
  rows: number;
  step: number;
  point(id: number): PlanPoint;
  edgeGrade(from: number, to: number): number | undefined;
}

/** Find a road on a terrain grid using Seed's distance, turn and grade costs. */
export function searchTerrainRoadGrid(start: number, end: number, grid: TerrainRoadGrid): number[] | undefined {
  const { columns, rows, step, point, edgeGrade } = grid;
  const costs = new Float64Array(columns * rows).fill(Infinity),
    parent = new Int32Array(columns * rows).fill(-1),
    queue = new Heap();
  costs[start] = 0;
  queue.push(start, distance(point(start), point(end)));
  const done = new Set<number>();
  let visits = 0;
  while (queue.size && visits++ < limits.maxSearchVisits) {
    const at = queue.pop();
    if (done.has(at)) continue;
    done.add(at);
    if (at === end) {
      const route = [at];
      while (route.at(-1) !== start) route.push(parent[route.at(-1)!]);
      return route.reverse();
    }
    const x = at % columns,
      z = Math.floor(at / columns);
    for (const [dx, dz] of [
      [-1, 0],
      [1, 0],
      [0, -1],
      [0, 1],
      [-1, -1],
      [-1, 1],
      [1, -1],
      [1, 1]
    ]) {
      if (x + dx < 0 || x + dx >= columns || z + dz < 0 || z + dz >= rows) continue;
      const next = (z + dz) * columns + x + dx;
      if (done.has(next)) continue;
      const grade = edgeGrade(at, next);
      if (grade === undefined) continue;
      const incoming = parent[at] >= 0 ? point(parent[at]) : undefined;
      const bendCos = incoming
        ? ((point(at).x - incoming.x) * dx + (point(at).z - incoming.z) * dz) /
          (distance(point(at), incoming) * Math.hypot(dx, dz))
        : 1;
      const turnCost = step * limits.turnPenalty * (1 - bendCos) ** 2;
      const cost =
        costs[at] +
        turnCost +
        Math.hypot(dx, dz) * step * (1 + limits.slopePenalty * Math.max(0, grade / limits.maxSlope) ** 2);
      if (cost >= costs[next]) continue;
      costs[next] = cost;
      parent[next] = at;
      queue.push(next, cost + distance(point(next), point(end)));
    }
  }
}

/** Measure the steepest ground grade along a road segment. */
export function terrainRoadSegmentGrade(a: PlanPoint, b: PlanPoint, ground: (point: PlanPoint) => number): number {
  const length = distance(a, b);
  if (length <= 1e-6) return 0;
  const steps = Math.max(1, Math.ceil(length / 2));
  let previousHeight = ground(a),
    steepest = 0;
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const height = ground({ x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t });
    steepest = Math.max(steepest, Math.abs(height - previousHeight) / (length / steps));
    previousHeight = height;
  }
  return steepest;
}

class Heap {
  private entries: { id: number; cost: number }[] = [];
  get size() {
    return this.entries.length;
  }
  push(id: number, cost: number) {
    const q = this.entries;
    let i = q.length;
    q.push({ id, cost });
    while (i) {
      const p = (i - 1) >> 1;
      if (q[p].cost <= cost) break;
      q[i] = q[p];
      i = p;
    }
    q[i] = { id, cost };
  }
  pop() {
    const q = this.entries,
      first = q[0].id,
      last = q.pop()!;
    if (q.length) {
      let i = 0;
      while (i * 2 + 1 < q.length) {
        let c = i * 2 + 1;
        if (c + 1 < q.length && q[c + 1].cost < q[c].cost) c++;
        if (q[c].cost >= last.cost) break;
        q[i] = q[c];
        i = c;
      }
      q[i] = last;
    }
    return first;
  }
}
