import type { LandscapePoint } from "./VegetationLandscapePlan";

interface Segment {
  a: LandscapePoint;
  b: LandscapePoint;
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}
interface Node {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  left: number;
  right: number;
  segments?: readonly Segment[];
}

/** Exact world-metre distance to a segment, including a zero-length segment. */
export function landscapeSegmentDistance(p: LandscapePoint, a: LandscapePoint, b: LandscapePoint): number {
  const dx = b[0] - a[0],
    dz = b[1] - a[1];
  const length2 = dx * dx + dz * dz;
  const t = length2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / length2)) : 0;
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dz);
}

/** Prepared immutable line geometry; the cutoff omits distances that have no influence on the caller. */
export interface LandscapePolylineQuery {
  /**
   * Finds the exact nearest distance, or Infinity when no segment lies within maximumDistance.
   * @param point World XZ coordinates.
   * @param maximumDistance Non-negative influence radius; omitted means an unbounded nearest query.
   * @returns The nearest exact distance in metres, or Infinity outside the cutoff.
   */
  distance(point: LandscapePoint, maximumDistance?: number): number;
}

/**
 * Prepares a spatial hierarchy once for repeated exact distance queries without per-query arrays.
 * @param points Finite world XZ coordinates in traversal order; closure is explicit.
 * @returns A detached geometry snapshot, including an empty query for fewer than two points.
 */
export function createLandscapePolylineQuery(points: readonly LandscapePoint[]): LandscapePolylineQuery {
  const segments: Segment[] = [];
  for (let i = 1; i < points.length; i++) {
    const a: LandscapePoint = [points[i - 1][0], points[i - 1][1]],
      b: LandscapePoint = [points[i][0], points[i][1]];
    segments.push({
      a,
      b,
      minX: Math.min(a[0], b[0]),
      maxX: Math.max(a[0], b[0]),
      minZ: Math.min(a[1], b[1]),
      maxZ: Math.max(a[1], b[1])
    });
  }
  const nodes: Node[] = [],
    stack: number[] = [];
  const build = (parts: Segment[]): number => {
    const node: Node = { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity, left: -1, right: -1 };
    for (const part of parts) {
      node.minX = Math.min(node.minX, part.minX);
      node.maxX = Math.max(node.maxX, part.maxX);
      node.minZ = Math.min(node.minZ, part.minZ);
      node.maxZ = Math.max(node.maxZ, part.maxZ);
    }
    const index = nodes.push(node) - 1;
    if (parts.length <= 8) node.segments = parts;
    else {
      const xAxis = node.maxX - node.minX >= node.maxZ - node.minZ;
      parts.sort((a, b) => (xAxis ? a.minX + a.maxX - b.minX - b.maxX : a.minZ + a.maxZ - b.minZ - b.maxZ));
      const middle = parts.length >>> 1;
      node.left = build(parts.slice(0, middle));
      node.right = build(parts.slice(middle));
    }
    return index;
  };
  if (segments.length) build(segments);
  return {
    distance(point, maximumDistance = Infinity) {
      let nearest = maximumDistance,
        found = false;
      stack.length = 0;
      if (nodes.length) stack.push(0);
      while (stack.length) {
        const node = nodes[stack.pop()!];
        const dx = Math.max(node.minX - point[0], 0, point[0] - node.maxX);
        const dz = Math.max(node.minZ - point[1], 0, point[1] - node.maxZ);
        // Broad-phase tolerance only adds candidates; the exact distance still decides the cutoff.
        const limit = nearest + Math.max(1, Math.abs(point[0]), Math.abs(point[1]), nearest) * Number.EPSILON * 8;
        if (dx > limit || dz > limit || dx * dx + dz * dz > limit * limit) continue;
        if (node.segments) {
          for (const segment of node.segments) {
            const distance = landscapeSegmentDistance(point, segment.a, segment.b);
            if (distance <= nearest) {
              nearest = distance;
              found = true;
            }
          }
        } else {
          stack.push(node.left, node.right);
        }
      }
      return found ? nearest : Infinity;
    }
  };
}
