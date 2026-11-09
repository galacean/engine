import { mapSurfaceBoundary, type SurfaceBoundary } from "./SurfacePolygon";
import { cross, dot, scale, sub } from "./RecoveredRoofGeometry";

/** The uncut facet owns both its physical plane and its original clipping chart.
 * Gradients map world displacement to chart displacement; they need not be unit
 * length or orthogonal (roof UV charts are not generally isometric). */
export interface ConstructionSurfaceFrame {
  origin: number[];
  normal: number[];
  uvOrigin: number[];
  uGradient: number[];
  vGradient: number[];
}
export function constructionSurfaceFrame(
  a: number[],
  b: number[],
  c: number[],
  uv?: number[][]
): ConstructionSurfaceFrame | null {
  const points = [a, b, c],
    edges = [sub(b, a), sub(c, b), sub(a, c)];
  const lengths = edges.map((e) => dot(e, e));
  const i = lengths.reduce((best, n, k) => (n > lengths[best] ? k : best), 0);
  const edge = edges[i],
    other = sub(points[(i + 2) % 3], points[i]),
    n = cross(edge, other);
  const normalLength = Math.hypot(...n),
    edgeLength = Math.sqrt(lengths[i]);
  if (!edgeLength || !normalLength) return null;
  const normal = scale(n, 1 / normalLength);
  if (!uv) {
    const tangent = scale(edge, 1 / edgeLength);
    return { origin: [...points[i]], normal, uvOrigin: [0, 0], uGradient: tangent, vGradient: cross(normal, tangent) };
  }
  // Dual vectors avoid subtracting nearly equal Gram products. Derive only from
  // the uncut facet, never from a thin clipped polygon or its render triangles.
  const eDual = scale(cross(other, normal), 1 / normalLength),
    oDual = scale(cross(normal, edge), 1 / normalLength);
  const from = uv[i],
    to = uv[(i + 1) % 3],
    third = uv[(i + 2) % 3];
  const gradient = (axis: number) =>
    eDual.map((v, k) => v * (to[axis] - from[axis]) + oDual[k] * (third[axis] - from[axis]));
  return { origin: [...points[i]], normal, uvOrigin: [...from], uGradient: gradient(0), vGradient: gradient(1) };
}
export function projectConstructionSurface(frame: ConstructionSurfaceFrame, point: number[]): number[] {
  const d = sub(point, frame.origin);
  return [frame.uvOrigin[0] + dot(d, frame.uGradient), frame.uvOrigin[1] + dot(d, frame.vGradient)];
}
/** A convex effective region, before fan triangulation for rendering/collision. */
export interface ConstructionSurfaceRegion {
  indices: number[];
  boundary: SurfaceBoundary;
  frame: ConstructionSurfaceFrame | null;
}

/** Affine recharting acts on original line definitions, not clipped endpoints. */
export function rechartConstructionBoundary(
  boundary: SurfaceBoundary,
  from: ConstructionSurfaceFrame,
  to: ConstructionSurfaceFrame
) {
  const u = cross(from.vGradient, from.normal),
    v = cross(from.normal, from.uGradient),
    det = dot(from.uGradient, u);
  if (!det) throw Error("Surface chart must be invertible");
  return mapSurfaceBoundary(boundary, {
    origin: from.uvOrigin,
    offset: projectConstructionSurface(to, from.origin),
    u: [dot(u, to.uGradient) / det, dot(u, to.vGradient) / det],
    v: [dot(v, to.uGradient) / det, dot(v, to.vGradient) / det]
  });
}
