import type { Matrix } from "@galacean/engine-math";
import { surfaceBoundary } from "./SurfacePolygon";
import {
  constructionSurfaceFrame,
  projectConstructionSurface,
  type ConstructionSurfaceFrame
} from "./ConstructionSurfaceFrame";
import { triangleIntersectsBounds, segmentTriangleDistanceSquared } from "./SurfaceQueryMath";
import type { ConstructionSurfacePart } from "./ConstructionPreview";
import { sameStructuralSurface, type StructuralMesh } from "./ConstructionSurfaceEquality";
type V = [number, number, number];
const sub = (a: V, b: V): V => [a[0] - b[0], a[1] - b[1], a[2] - b[2]],
  dot = (a: V, b: V) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2],
  cross = (a: V, b: V): V => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
/** Structural collision uses actual generated surfaces, not the original planning box.
 * Reuses only the shared segment/triangle math; no legacy asset or generator dependency.
 * Includes generated openings and decoration geometry, but not individual brick roughness.
 * Does not prove swept locomotion. */
export class ConstructionSurfaceQuery {
  private parts: (StructuralMesh & { min: V; max: V })[];
  constructor(parts: ConstructionSurfacePart[], position: readonly number[], owner: (id: string) => string) {
    const translated = new Map<ConstructionSurfaceFrame, ConstructionSurfaceFrame>();
    const translateFrame = (frame: ConstructionSurfaceFrame | null) => {
      if (!frame) return null;
      let result = translated.get(frame);
      if (!result) {
        result = {
          origin: frame.origin.map((x, i) => x + position[i]),
          normal: [...frame.normal],
          uvOrigin: [...frame.uvOrigin],
          uGradient: [...frame.uGradient],
          vGradient: [...frame.vGradient]
        };
        translated.set(frame, result);
      }
      return result;
    };
    this.parts = parts.map((p) => {
      const vertices: V[] = [],
        min: V = [Infinity, Infinity, Infinity],
        max: V = [-Infinity, -Infinity, -Infinity];
      for (let i = 0; i < p.positions.length; i += 3) {
        const v = p.positions.slice(i, i + 3).map((n, j) => n + position[j]) as V;
        vertices.push(v);
        for (let j = 0; j < 3; j++) {
          min[j] = Math.min(min[j], v[j]);
          max[j] = Math.max(max[j], v[j]);
        }
      }
      // Plain uncut meshes get one region per original triangle. Clipped support
      // producers retain their original polygons/charts explicitly.
      const regions =
        p.regions ??
        Array.from({ length: p.indices.length / 3 }, (_, i) => {
          const indices = p.indices.slice(i * 3, i * 3 + 3),
            points = indices.map((k) => p.positions.slice(k * 3, k * 3 + 3)),
            frame = constructionSurfaceFrame(points[0], points[1], points[2]);
          return {
            indices,
            frame,
            boundary: surfaceBoundary(frame ? points.map((p) => projectConstructionSurface(frame, p)) : [])
          };
        });
      // Only clipped boundaries carry a graph. Clone them together so source
      // lines shared by edges and intersections remain shared across fragments.
      // Uncut boundaries contain only coordinate values; copy those directly.
      const constrained = regions.filter((r) => r.boundary.constraints).map((r) => r.boundary);
      const clipped = constrained.length ? structuredClone(constrained) : [];
      let nextClipped = 0;
      return {
        owner: owner(p.owner),
        vertices,
        indices: [...p.indices],
        regions: regions.map((r) => ({
          indices: [...r.indices],
          boundary: r.boundary.constraints ? clipped[nextClipped++] : { points: r.boundary.points.map((p) => [...p]) },
          frame: translateFrame(r.frame)
        })),
        min,
        max
      };
    });
  }
  /** Immutable snapshot in a Scene frame. Transform vertices in world space so
   * capsule radii remain metres under non-uniform scale; transforming the query
   * ray alone would incorrectly turn a world-space capsule into a local sphere. */
  transformed(matrix: Matrix): ConstructionSurfaceQuery {
    const m = matrix.elements;
    if (
      ![...m].every(Number.isFinite) ||
      m[3] !== 0 ||
      m[7] !== 0 ||
      m[11] !== 0 ||
      m[15] !== 1 ||
      matrix.determinant() === 0
    )
      throw Error("Structural surface requires an invertible affine transform");
    // Structural equality works in double precision. Storing the inverse in an
    // Engine Matrix would round covectors to float32 and move their planes away
    // from the transformed vertices, especially after nonuniform scale/shear.
    const a: V = [m[0], m[1], m[2]],
      b: V = [m[4], m[5], m[6]],
      c: V = [m[8], m[9], m[10]];
    const x = cross(b, c),
      y = cross(c, a),
      z = cross(a, b),
      determinant = dot(a, x);
    const inverseTranspose = [x, y, z].map((column) => column.map((value) => value / determinant));
    if (!inverseTranspose.flat().every(Number.isFinite)) throw Error("Structural surface transform is not finite");
    const transform = (value: readonly number[], gradient = false): V =>
      gradient
        ? ([0, 1, 2].map(
            (axis) =>
              inverseTranspose[0][axis] * value[0] +
              inverseTranspose[1][axis] * value[1] +
              inverseTranspose[2][axis] * value[2]
          ) as V)
        : ([0, 1, 2].map(
            (axis) => m[axis] * value[0] + m[axis + 4] * value[1] + m[axis + 8] * value[2] + m[axis + 12]
          ) as V);
    const frames = new Map<ConstructionSurfaceFrame, ConstructionSurfaceFrame>();
    const frame = (source: ConstructionSurfaceFrame | null) => {
      if (!source) return null;
      let result = frames.get(source);
      if (!result) {
        const normal = transform(source.normal, true),
          length = Math.hypot(...normal);
        result = {
          origin: transform(source.origin),
          normal: normal.map((value) => value / length),
          uvOrigin: [...source.uvOrigin],
          uGradient: transform(source.uGradient, true),
          vGradient: transform(source.vGradient, true)
        };
        frames.set(source, result);
      }
      return result;
    };
    return ConstructionSurfaceQuery.fromParts(
      this.parts.map((part) => {
        const min: V = [Infinity, Infinity, Infinity],
          max: V = [-Infinity, -Infinity, -Infinity];
        const vertices = part.vertices.map((vertex) => {
          const value = transform(vertex);
          for (let axis = 0; axis < 3; axis++) {
            min[axis] = Math.min(min[axis], value[axis]);
            max[axis] = Math.max(max[axis], value[axis]);
          }
          return value;
        });
        return {
          ...part,
          vertices,
          min,
          max,
          regions: part.regions.map((region) => ({ ...region, frame: frame(region.frame) }))
        };
      })
    );
  }
  /** Removing a live owner must not mutate an already captured terrain transaction. */
  withoutOwner(owner: string): ConstructionSurfaceQuery {
    return ConstructionSurfaceQuery.fromParts(this.parts.filter((part) => part.owner !== owner));
  }
  /** Detached query data for Worker handoff. Ownership transfers to the receiving view. */
  snapshot() {
    return this.parts;
  }
  static fromSnapshot(parts: ReturnType<ConstructionSurfaceQuery["snapshot"]>) {
    return ConstructionSurfaceQuery.fromParts(parts);
  }
  private static fromParts(parts: ConstructionSurfaceQuery["parts"]): ConstructionSurfaceQuery {
    const query = new ConstructionSurfaceQuery([], [0, 0, 0], (id) => id);
    query.parts = parts;
    return query;
  }
  get bounds() {
    return this.parts.map(({ min, max }) => ({ min: [...min] as V, max: [...max] as V }));
  }
  /** Compare effective structural surfaces, never render batches or triangulation.
   * Called only when an edit commits; bounds alone cannot detect openings or moved internal faces. */
  hasSameGeometry(other: ConstructionSurfaceQuery): boolean {
    const identical =
      this.parts.length === other.parts.length &&
      this.parts.every((part, i) => {
        const next = other.parts[i];
        return (
          part.owner === next.owner &&
          part.vertices.length === next.vertices.length &&
          part.indices.length === next.indices.length &&
          part.indices.every((index, j) => index === next.indices[j]) &&
          part.vertices.every((vertex, j) => vertex.every((value, axis) => value === next.vertices[j][axis]))
        );
      });
    return identical || sameStructuralSurface(this.parts, other.parts);
  }
  intersectBounds(min: V, max: V) {
    if (min.some((v, i) => v > max[i])) throw Error("Ordered surface bounds required");
    for (const p of this.candidates(min, max, 0))
      for (let i = 0; i < p.indices.length; i += 3)
        if (
          triangleIntersectsBounds(
            p.vertices[p.indices[i]],
            p.vertices[p.indices[i + 1]],
            p.vertices[p.indices[i + 2]],
            min,
            max
          )
        )
          return { building: p.owner, subject: p.owner };
    return null;
  }
  private candidates(start: V, end: V, radius: number) {
    if (![...start, ...end, radius].every(Number.isFinite) || radius < 0) throw Error("Finite surface query required");
    return this.parts.filter((p) =>
      p.min.every((v, i) => v <= Math.max(start[i], end[i]) + radius && p.max[i] >= Math.min(start[i], end[i]) - radius)
    );
  }
  intersectSegment(start: V, end: V) {
    const d = sub(end, start);
    if (Math.hypot(...d) === 0) throw Error("Nonzero surface segment required");
    let hit: { building: string; subject: string; fraction: number; position: V; normal: V } | null = null;
    for (const p of this.candidates(start, end, 0))
      for (let i = 0; i < p.indices.length; i += 3) {
        const a = p.vertices[p.indices[i]],
          e1 = sub(p.vertices[p.indices[i + 1]], a),
          e2 = sub(p.vertices[p.indices[i + 2]], a),
          n = cross(e1, e2),
          h = cross(d, e2),
          det = dot(e1, h);
        if (Math.abs(det) < 1e-12) continue;
        const s = sub(start, a),
          u = dot(s, h) / det,
          q = cross(s, e1),
          v = dot(d, q) / det,
          t = dot(e2, q) / det;
        if (u < 0 || v < 0 || u + v > 1 || t < 0 || t > 1 || (hit && t >= hit.fraction)) continue;
        const k = (dot(n, d) > 0 ? -1 : 1) / Math.hypot(...n);
        hit = {
          building: p.owner,
          subject: p.owner,
          fraction: t,
          position: start.map((v, i) => v + t * d[i]) as V,
          normal: n.map((v) => v * k) as V
        };
      }
    return hit;
  }
  intersectCapsule(start: V, end: V, radius: number) {
    for (const p of this.candidates(start, end, radius))
      for (let i = 0; i < p.indices.length; i += 3) {
        const distance = segmentTriangleDistanceSquared(
          start,
          end,
          p.vertices[p.indices[i]],
          p.vertices[p.indices[i + 1]],
          p.vertices[p.indices[i + 2]]
        );
        if (distance <= radius * radius)
          return { building: p.owner, subject: p.owner, axisDistance: Math.sqrt(distance) };
      }
    return null;
  }
}
