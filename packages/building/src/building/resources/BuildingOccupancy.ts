// The space a building prefab occupies, measured from its members' meshes and poses. It is solid:
// a window's frame occupies the space of its glass too. Each member is measured on its own, so
// that the gap between a frame and a shutter is not occupied.
import type { OccupancySolid } from "../core";

export type { OccupancySolid };
/** The height of a measuring band, in metres. */
const BAND = 0.1;
/** How far two neighbouring bands may differ and still become one layer, in metres. */
const MERGE = 0.02;
type Point = readonly [number, number];

/** The convex hull of a set of points, counter-clockwise. */
function convexHull(points: readonly Point[]): Point[] {
  const sorted = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const unique = sorted.filter((p, i) => !i || p[0] !== sorted[i - 1][0] || p[1] !== sorted[i - 1][1]);
  if (unique.length < 3) return unique;
  const turn = (a: Point, b: Point, c: Point) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  const chain = (list: readonly Point[]) => {
    const out: Point[] = [];
    for (const p of list) {
      while (out.length >= 2 && turn(out[out.length - 2], out[out.length - 1], p) <= 1e-12) out.pop();
      out.push(p);
    }
    out.pop();
    return out;
  };
  return [...chain(unique), ...chain([...unique].reverse())];
}
/** How far a point lies outside a convex hull, in metres: 0 inside it. */
function outside(hull: readonly Point[], p: Point): number {
  let nearest = Infinity,
    inside = true;
  hull.forEach((a, i) => {
    const b = hull[(i + 1) % hull.length];
    const dx = b[0] - a[0],
      dz = b[1] - a[1],
      l2 = dx * dx + dz * dz || 1;
    if (dx * (p[1] - a[1]) - dz * (p[0] - a[0]) < 0) inside = false;
    const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / l2));
    nearest = Math.min(nearest, Math.hypot(a[0] + dx * t - p[0], a[1] + dz * t - p[1]));
  });
  return inside ? 0 : nearest;
}
/** The space a triangle mesh occupies, in layers from the bottom up. Each band of height collects
 * what the triangles leave in it and takes its convex outline; bands that differ by no more than
 * 2 cm become one layer. `positions` holds x, y, z per vertex, already in the prefab's space. A
 * `cover` member lies over what the prefab stands on, as a stone surround does. */
export function meshOccupancy(
  path: string,
  positions: readonly number[],
  indices: readonly number[],
  cover = false
): OccupancySolid[] {
  let lo = Infinity,
    hi = -Infinity;
  for (let i = 1; i < positions.length; i += 3) {
    lo = Math.min(lo, positions[i]);
    hi = Math.max(hi, positions[i]);
  }
  if (!(hi > lo)) return [];
  const count = Math.max(1, Math.ceil((hi - lo) / BAND)),
    step = (hi - lo) / count;
  const bands: Point[][] = Array.from({ length: count }, () => []);
  const vertex = (i: number) => [positions[3 * i], positions[3 * i + 1], positions[3 * i + 2]];
  for (let t = 0; t + 2 < indices.length; t += 3) {
    const tri = [vertex(indices[t]), vertex(indices[t + 1]), vertex(indices[t + 2])];
    const ys = tri.map((q) => q[1]);
    const first = Math.max(0, Math.floor((Math.min(...ys) - lo) / step)),
      last = Math.min(count - 1, Math.floor((Math.max(...ys) - lo) / step));
    for (let b = first; b <= last; b++) {
      const [y0, y1] = [lo + b * step, lo + (b + 1) * step];
      for (let e = 0; e < 3; e++) {
        const p = tri[e],
          q = tri[(e + 1) % 3];
        if (p[1] >= y0 && p[1] <= y1) bands[b].push([p[0], p[2]]);
        for (const y of [y0, y1])
          if ((p[1] - y) * (q[1] - y) < 0) {
            const s = (y - p[1]) / (q[1] - p[1]);
            bands[b].push([p[0] + (q[0] - p[0]) * s, p[2] + (q[2] - p[2]) * s]);
          }
      }
    }
  }
  const solids: { y: [number, number]; hull: Point[] }[] = [];
  bands.forEach((points, b) => {
    const hull = convexHull(points);
    if (hull.length < 3) return;
    const y: [number, number] = [lo + b * step, lo + (b + 1) * step];
    const last = solids[solids.length - 1];
    if (last && Math.abs(last.y[1] - y[0]) < 1e-9) {
      const merged = convexHull([...last.hull, ...hull]);
      if (merged.every((p) => outside(last.hull, p) <= MERGE && outside(hull, p) <= MERGE)) {
        last.y[1] = y[1];
        last.hull = merged;
        return;
      }
    }
    solids.push({ y, hull });
  });
  return solids.map((s) => ({ path, ...s, ...(cover && { cover }) }));
}
