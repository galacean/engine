import {
  intersectSurfacePolygon,
  subtractSurfacePolygon,
  surfaceRegionBoundary,
  type SurfaceBoundary
} from "./SurfacePolygon";

export interface ConstructionPlasterDomain {
  /** Original published chart length, never inferred from surviving fragments. */
  wallLength: number;
  /** Shape-owned finish permission in the original wall chart. This is not
   * backing geometry and must never clip structure or material placement. */
  permission?: SurfaceBoundary;
  /** Union of permitted, actually supported regions after openings/real cuts.
   * Only this final boundary drives erosion; paint partitions are excluded. */
  regions: SurfaceBoundary[];
}

/** Build once per owner, after real cuts and before paint batching. Distance is
 * periodic in the original metric wall chart; no material/LOD/UV-transform input.
 * Native erosion saturates at one chart unit. A spatial index bounds query work
 * to nearby exposed edges instead of scanning every edge for every vertex. */
export function plasterBoundaryDistance(domain: ConstructionPlasterDomain) {
  const segments = surfaceRegionBoundary(domain.regions, domain.wallLength);
  const buckets = new Map<string, number[][][]>();
  for (const segment of segments)
    for (const shift of [-domain.wallLength, 0, domain.wallLength]) {
      const edge = segment.map((p) => [p[0] + shift, p[1]]);
      for (
        let x = Math.floor(Math.min(edge[0][0], edge[1][0]) - 1);
        x <= Math.floor(Math.max(edge[0][0], edge[1][0]) + 1);
        x++
      )
        for (
          let y = Math.floor(Math.min(edge[0][1], edge[1][1]) - 1);
          y <= Math.floor(Math.max(edge[0][1], edge[1][1]) + 1);
          y++
        ) {
          const key = `${x}/${y}`;
          let list = buckets.get(key);
          if (!list) buckets.set(key, (list = []));
          list.push(edge);
        }
    }
  return (uv: readonly number[]) => {
    const u = ((uv[0] % domain.wallLength) + domain.wallLength) % domain.wallLength;
    let distance2 = 1;
    for (const [a, b] of buckets.get(`${Math.floor(u)}/${Math.floor(uv[1])}`) ?? []) {
      const dx = b[0] - a[0],
        dy = b[1] - a[1];
      // Distinct exact intersections can round to the same output coordinate.
      // Treat that interval as a point; never divide by a zero-length segment.
      const length2 = dx * dx + dy * dy;
      const t = length2 > 0 ? Math.max(0, Math.min(1, ((u - a[0]) * dx + (uv[1] - a[1]) * dy) / length2)) : 0;
      distance2 = Math.min(distance2, (u - a[0] - dx * t) ** 2 + (uv[1] - a[1] - dy * t) ** 2);
    }
    return Math.sqrt(distance2);
  };
}

/** Intersect with the union of effective backing faces. Subtract accepted areas
 * from the remainder so overlapping courses cannot duplicate coplanar skin.
 * All operations retain source-edge/intersection provenance in the wall chart. */
export function clipPlasterSupport(source: SurfaceBoundary, supports: readonly SurfaceBoundary[]): SurfaceBoundary[] {
  let remainder = [source];
  const result: SurfaceBoundary[] = [];
  const bounds = (p: SurfaceBoundary) =>
    p.points.reduce(
      (b, p) => [Math.min(b[0], p[0]), Math.min(b[1], p[1]), Math.max(b[2], p[0]), Math.max(b[3], p[1])],
      [Infinity, Infinity, -Infinity, -Infinity]
    );
  const sourceBounds = bounds(source);
  for (const support of supports) {
    const b = bounds(support);
    if (b[0] >= sourceBounds[2] || b[2] <= sourceBounds[0] || b[1] >= sourceBounds[3] || b[3] <= sourceBounds[1])
      continue;
    const next: SurfaceBoundary[] = [];
    for (const piece of remainder) {
      const intersection = intersectSurfacePolygon(piece, support);
      if (!intersection.points.length) next.push(piece);
      else {
        result.push(intersection);
        for (const outside of subtractSurfacePolygon(piece, support)) next.push(outside);
      }
    }
    remainder = next;
    if (!remainder.length) break;
  }
  return result;
}
