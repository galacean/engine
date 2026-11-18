import { surfaceArea, subtractSurfacePolygon } from "./SurfacePolygon";
import { rechartConstructionBoundary, type ConstructionSurfaceRegion } from "./ConstructionSurfaceFrame";
import { dot, sub, EPS } from "./RecoveredRoofGeometry";

type V = [number, number, number];
export interface StructuralMesh {
  owner: string;
  vertices: V[];
  indices: number[];
  regions: ConstructionSurfaceRegion[];
}
interface Bounds {
  min: number[];
  max: number[];
}
interface Region extends Bounds {
  points: V[];
  key: string;
  source: ConstructionSurfaceRegion;
}
interface Node extends Bounds {
  regions?: Region[];
  children?: Node[];
}
// Metres: only absorb floating-point lifting/clipping noise. Uncovered area uses
// the producer's original UV chart and its existing area EPS (1e-10).
const PLANE_EPS = 1e-9;
const overlaps = (a: Bounds, b: Bounds) =>
  a.min.every((v, i) => v <= b.max[i] + PLANE_EPS && a.max[i] >= b.min[i] - PLANE_EPS);
function bounds(items: Bounds[]): Bounds {
  const min = [Infinity, Infinity, Infinity],
    max = [-Infinity, -Infinity, -Infinity];
  for (const item of items)
    for (let i = 0; i < 3; i++) {
      min[i] = Math.min(min[i], item.min[i]);
      max[i] = Math.max(max[i], item.max[i]);
    }
  return { min, max };
}
function tree(regions: Region[]): Node {
  const box = bounds(regions);
  if (regions.length <= 12) return { ...box, regions };
  const axis = box.max.map((v, i) => v - box.min[i]).reduce((best, v, i, spans) => (v > spans[best] ? i : best), 0);
  regions.sort((a, b) => a.min[axis] + a.max[axis] - (b.min[axis] + b.max[axis]));
  const mid = regions.length >>> 1;
  return { ...box, children: [tree(regions.slice(0, mid)), tree(regions.slice(mid))] };
}
function candidates(node: Node, box: Bounds, out: Region[]) {
  if (!overlaps(node, box)) return;
  if (node.regions) {
    for (const t of node.regions) if (overlaps(t, box)) out.push(t);
  } else for (const child of node.children!) candidates(child, box, out);
}
function byOwner(parts: StructuralMesh[]) {
  const groups = new Map<string, Map<string, Region>>();
  for (const p of parts)
    for (const region of p.regions) {
      const points = region.indices.map((k) => p.vertices[k]);
      // Convex boundaries are two-sided; winding, duplicates and batching do not
      // change coverage, while ownership remains observable.
      const key = points
        .map((v) => v.join(","))
        .sort()
        .join(";");
      let group = groups.get(p.owner);
      if (!group) groups.set(p.owner, (group = new Map()));
      if (!group.has(key))
        group.set(key, {
          points,
          key,
          source: region,
          min: [0, 1, 2].map((axis) => Math.min(...points.map((p) => p[axis]))),
          max: [0, 1, 2].map((axis) => Math.max(...points.map((p) => p[axis])))
        });
    }
  return groups;
}
function covered(source: Map<string, Region>, target: Map<string, Region>): boolean {
  let index: Node | undefined;
  const uncovered = new Map<NonNullable<ConstructionSurfaceRegion["frame"]>, number>();
  for (const t of source.values()) {
    if (target.has(t.key)) continue;
    // Use the producer's effective polygon and clipping metric. Rechecking each
    // render fan triangle in an orthonormal plane changes both area and granularity.
    const frame = t.source.frame;
    if (!frame) return false;
    const { origin, normal } = frame;
    const polygon = t.source.boundary;
    if (!polygon.points.length) return false;
    let remainder = [polygon];
    const nearby: Region[] = [];
    index ??= tree([...target.values()]);
    candidates(index, t, nearby);
    for (const candidate of nearby) {
      if (candidate.points.some((p) => Math.abs(dot(sub(p, origin), normal)) > PLANE_EPS)) continue;
      const next = candidate.source.frame;
      const sameChart =
        next &&
        (["origin", "normal", "uvOrigin", "uGradient", "vGradient"] as const).every((k) =>
          frame[k].every((v, i) => v === next[k][i])
        );
      if (!next) continue;
      const clip = sameChart
        ? candidate.source.boundary
        : rechartConstructionBoundary(candidate.source.boundary, next, frame);
      if (!clip.points.length) continue;
      remainder = remainder.flatMap((p) => subtractSurfacePolygon(p, clip));
      if (!remainder.length) break;
    }
    // Accumulate across all fragments sharing one original facet frame. Apply the
    // same source-chart area threshold as generation, never once per paint/cut cell.
    const missing = (uncovered.get(frame) ?? 0) + remainder.reduce((sum, p) => sum + Math.abs(surfaceArea(p)), 0);
    if (missing > EPS) return false;
    uncovered.set(frame, missing);
  }
  return true;
}
/** Compare effective surface coverage in both directions, independent of render
 * triangulation. Exact regions skip clipping; a temporary BVH limits the changed
 * regions' candidates. No extra region cache, sampling or per-frame work. */
export function sameStructuralSurface(a: StructuralMesh[], b: StructuralMesh[]): boolean {
  const left = byOwner(a),
    right = byOwner(b);
  if (left.size !== right.size) return false;
  for (const [owner, regions] of left) {
    const next = right.get(owner);
    if (!next || !covered(regions, next) || !covered(next, regions)) return false;
  }
  return true;
}
