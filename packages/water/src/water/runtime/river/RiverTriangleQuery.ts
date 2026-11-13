import type { RiverGeometryData, ReadonlyVector3Tuple } from "../../compiler/river/types";
import { RIVER_QUERY_EPSILON } from "./constants";

export type RiverQueryTriangle = readonly [ReadonlyVector3Tuple, ReadonlyVector3Tuple, ReadonlyVector3Tuple];
export interface RiverTriangleWeights {
  firstWeight: number;
  secondWeight: number;
  thirdWeight: number;
}
export interface RiverQueryBounds {
  minX: number;
  minZ: number;
  maxX: number;
  maxZ: number;
}

function determinant(a: ReadonlyVector3Tuple, b: ReadonlyVector3Tuple, c: ReadonlyVector3Tuple): number {
  return (b[2] - c[2]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[2] - c[2]);
}

/** The native static/dynamic triangle ownership rule, including its dimensionless tolerance. */
export function sampleRiverTriangle(
  a: ReadonlyVector3Tuple,
  b: ReadonlyVector3Tuple,
  c: ReadonlyVector3Tuple,
  x: number,
  z: number,
  out: RiverTriangleWeights,
  canonical?: RiverQueryTriangle
): boolean {
  const d = determinant(a, b, c);
  if (Math.abs(d) <= RIVER_QUERY_EPSILON) return false;
  const wa = ((b[2] - c[2]) * (x - c[0]) + (c[0] - b[0]) * (z - c[2])) / d,
    wb = ((c[2] - a[2]) * (x - c[0]) + (a[0] - c[0]) * (z - c[2])) / d,
    wc = 1 - wa - wb;
  // Use the same geometric boundary as candidate construction. Comparing
  // independently rounded weights with -epsilon can disagree by one ULP and
  // leave an endless dry strip along an otherwise valid candidate edge.
  if (wa < 0 || wb < 0 || wc < 0) {
    const domain = canonical ?? riverTriangleQueryVertices(a, b, c);
    if (!riverTriangleIntersectsBounds(domain, { minX: x, maxX: x, minZ: z, maxZ: z })) return false;
  }
  out.firstWeight = wa;
  out.secondWeight = wb;
  out.thirdWeight = wc;
  return true;
}

/** One canonical expanded domain also drives native boundary ownership. */
export function riverTriangleQueryVertices(
  a: ReadonlyVector3Tuple,
  b: ReadonlyVector3Tuple,
  c: ReadonlyVector3Tuple
): RiverQueryTriangle {
  const vertex = (p: ReadonlyVector3Tuple, q: ReadonlyVector3Tuple, r: ReadonlyVector3Tuple): ReadonlyVector3Tuple => [
    p[0] + RIVER_QUERY_EPSILON * (p[0] - q[0] + (p[0] - r[0])),
    p[1] + RIVER_QUERY_EPSILON * (p[1] - q[1] + (p[1] - r[1])),
    p[2] + RIVER_QUERY_EPSILON * (p[2] - q[2] + (p[2] - r[2]))
  ];
  return [vertex(a, b, c), vertex(b, a, c), vertex(c, a, b)];
}

/** Clip an already valid domain without applying native degeneracy or tolerance again. */
export function clipRiverTriangle(triangle: RiverQueryTriangle, bounds: RiverQueryBounds): RiverQueryTriangle[] {
  let polygon = [...triangle];
  if (polygon.every((p) => p[0] >= bounds.minX && p[0] <= bounds.maxX && p[2] >= bounds.minZ && p[2] <= bounds.maxZ))
    return [[polygon[0], polygon[1], polygon[2]]];
  for (const [axis, edge, sign] of [
    [0, bounds.minX, 1],
    [0, bounds.maxX, -1],
    [2, bounds.minZ, 1],
    [2, bounds.maxZ, -1]
  ]) {
    const next: ReadonlyVector3Tuple[] = [];
    for (let i = 0; i < polygon.length; i++) {
      const p = polygon[i],
        q = polygon[(i + 1) % polygon.length],
        insideP = sign * (p[axis] - edge) >= 0,
        insideQ = sign * (q[axis] - edge) >= 0;
      if (insideP) next.push(p);
      if (insideP !== insideQ) {
        const t = (edge - p[axis]) / (q[axis] - p[axis]);
        const point: [number, number, number] = [
          p[0] + t * (q[0] - p[0]),
          p[1] + t * (q[1] - p[1]),
          p[2] + t * (q[2] - p[2])
        ];
        point[axis] = edge;
        next.push(point);
      }
    }
    polygon = next;
  }
  const triangles: RiverQueryTriangle[] = [];
  for (let i = 1; i + 1 < polygon.length; i++) triangles.push([polygon[0], polygon[i], polygon[i + 1]]);
  return triangles;
}

/** Separating axes of a triangle and an axis-aligned box. A circumscribed
 * circle is too loose for thin clipped cells and forces unnecessary subdivision. */
export function riverTriangleIntersectsBounds(triangle: RiverQueryTriangle, box: RiverQueryBounds): boolean {
  const a = triangle[0],
    b = triangle[1],
    c = triangle[2];
  const winding = (b[0] - a[0]) * (c[2] - a[2]) - (b[2] - a[2]) * (c[0] - a[0]);
  for (let i = 0; i < 3; i++) {
    const p = triangle[i],
      q = triangle[(i + 1) % 3],
      dx = q[0] - p[0],
      dz = q[2] - p[2];
    const sign = winding >= 0 ? 1 : -1;
    const x = -sign * dz >= 0 ? box.maxX : box.minX;
    const z = sign * dx >= 0 ? box.maxZ : box.minZ;
    if (sign * (dx * (z - p[2]) - dz * (x - p[0])) < 0) return false;
  }
  return true;
}

interface GeometryTriangleDomain extends RiverQueryBounds {
  readonly source: RiverQueryTriangle;
  readonly triangle: RiverQueryTriangle;
}
const geometryDomains = new WeakMap<RiverGeometryData, Map<number, GeometryTriangleDomain | null>>();
/** Immutable compiled facts, materialized one visited triangle at a time. */
export function riverGeometryTriangleDomain(
  geometry: RiverGeometryData,
  offset: number
): GeometryTriangleDomain | null {
  let entries = geometryDomains.get(geometry);
  if (!entries) geometryDomains.set(geometry, (entries = new Map()));
  if (entries.has(offset)) return entries.get(offset)!;
  const indices = geometry.indices.borrowTypedArray();
  const a = geometry.positions[indices[offset]],
    b = geometry.positions[indices[offset + 1]],
    c = geometry.positions[indices[offset + 2]];
  if (!a || !b || !c || Math.abs(determinant(a, b, c)) <= RIVER_QUERY_EPSILON) {
    entries.set(offset, null);
    return null;
  }
  const triangle = riverTriangleQueryVertices(a, b, c);
  const value: GeometryTriangleDomain = {
    source: [a, b, c],
    triangle,
    minX: Math.min(triangle[0][0], triangle[1][0], triangle[2][0]),
    maxX: Math.max(triangle[0][0], triangle[1][0], triangle[2][0]),
    minZ: Math.min(triangle[0][2], triangle[1][2], triangle[2][2]),
    maxZ: Math.max(triangle[0][2], triangle[1][2], triangle[2][2])
  };
  entries.set(offset, value);
  return value;
}
