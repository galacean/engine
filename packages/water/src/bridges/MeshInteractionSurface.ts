import type { Renderer } from "@galacean/engine-core";
import { BoundingBox, Matrix, Ray, Vector3 } from "@galacean/engine-math";

interface Node {
  bounds: BoundingBox;
  triangles?: number[];
  children?: readonly [Node, Node];
}

/** Explicit CPU interaction surfaces, independent of render batching and GPU data retention.
 * Owners register the same indexed triangles they upload. Weak ownership follows renderer lifetime;
 * replacing geometry requires registering the replacement. Unregistered render bounds are not solids. */
const surfaces = new WeakMap<Renderer, MeshInteractionSurface>();

export function registerMeshInteractionSurface(
  renderer: Renderer,
  geometry: { positions: ArrayLike<number>; indices: ArrayLike<number> } | MeshInteractionSurface
): void {
  surfaces.set(renderer, geometry instanceof MeshInteractionSurface ? geometry : new MeshInteractionSurface(geometry));
}

export function meshInteractionOccludes(renderer: Renderer, ray: Ray, distance: number): boolean {
  if (renderer.destroyed || !renderer.enabled || !renderer.entity.isActiveInHierarchy || distance <= 0) return false;
  const broad = ray.intersectBox(renderer.bounds);
  return (
    broad >= 0 &&
    broad < distance &&
    (surfaces.get(renderer)?.intersects(ray, distance, renderer.entity.transform.worldMatrix) ?? false)
  );
}

/** A reusable local-space geometry snapshot. Each query uses the caller's current transform;
 * no renderer or entity is retained. Bounds only reject candidates; a triangle hit blocks. */
export class MeshInteractionSurface {
  private readonly positions: Float32Array;
  private readonly indices: Uint32Array;
  private readonly root: Node;
  private readonly inverse = new Matrix();
  private readonly ray = new Ray();
  private readonly endpoint = new Vector3();
  constructor(geometry: { positions: ArrayLike<number>; indices: ArrayLike<number> }) {
    // Match the uploaded vertex precision, and do not retain mutable generator buffers.
    this.positions = Float32Array.from(geometry.positions);
    this.indices = Uint32Array.from(geometry.indices);
    this.root = this.build(Array.from({ length: this.indices.length / 3 }, (_, i) => i * 3));
  }
  private build(triangles: number[]): Node {
    const bounds = new BoundingBox(
      new Vector3(Infinity, Infinity, Infinity),
      new Vector3(-Infinity, -Infinity, -Infinity)
    );
    const p = this.positions;
    for (const t of triangles)
      for (let j = 0; j < 3; j++) {
        const v = this.indices[t + j] * 3;
        bounds.min.set(
          Math.min(bounds.min.x, p[v]),
          Math.min(bounds.min.y, p[v + 1]),
          Math.min(bounds.min.z, p[v + 2])
        );
        bounds.max.set(
          Math.max(bounds.max.x, p[v]),
          Math.max(bounds.max.y, p[v + 1]),
          Math.max(bounds.max.z, p[v + 2])
        );
      }
    if (triangles.length <= 12) return { bounds, triangles };
    const sizes = [bounds.max.x - bounds.min.x, bounds.max.y - bounds.min.y, bounds.max.z - bounds.min.z];
    const axis = sizes.indexOf(Math.max(...sizes));
    const center = (t: number) =>
      p[this.indices[t] * 3 + axis] + p[this.indices[t + 1] * 3 + axis] + p[this.indices[t + 2] * 3 + axis];
    triangles.sort((a, b) => center(a) - center(b));
    const middle = Math.floor(triangles.length / 2);
    return { bounds, children: [this.build(triangles.slice(0, middle)), this.build(triangles.slice(middle))] };
  }
  intersects(worldRay: Ray, distance: number, world: Matrix): boolean {
    // Transform a finite segment, so non-uniform scales preserve the world-space distance limit.
    Matrix.invert(world, this.inverse);
    this.ray.origin.copyFrom(worldRay.origin).transformCoordinate(this.inverse);
    worldRay.getPoint(distance, this.endpoint).transformCoordinate(this.inverse);
    Vector3.subtract(this.endpoint, this.ray.origin, this.ray.direction);
    const length = this.ray.direction.length();
    if (!Number.isFinite(length) || length <= 0) return false;
    this.ray.direction.scale(1 / length);
    return this.visit(this.root, length);
  }
  private visit(node: Node, distance: number): boolean {
    const broad = this.ray.intersectBox(node.bounds);
    if (broad < 0 || broad >= distance) return false;
    if (node.children) return this.visit(node.children[0], distance) || this.visit(node.children[1], distance);
    return node.triangles!.some((t) => this.hitTriangle(t, distance));
  }
  private hitTriangle(t: number, distance: number): boolean {
    const p = this.positions,
      a = this.indices[t] * 3,
      b = this.indices[t + 1] * 3,
      c = this.indices[t + 2] * 3;
    const e1x = p[b] - p[a],
      e1y = p[b + 1] - p[a + 1],
      e1z = p[b + 2] - p[a + 2];
    const e2x = p[c] - p[a],
      e2y = p[c + 1] - p[a + 1],
      e2z = p[c + 2] - p[a + 2];
    const { origin: o, direction: d } = this.ray;
    const hx = d.y * e2z - d.z * e2y,
      hy = d.z * e2x - d.x * e2z,
      hz = d.x * e2y - d.y * e2x;
    const det = e1x * hx + e1y * hy + e1z * hz;
    if (Math.abs(det) < 1e-12) return false;
    const sx = o.x - p[a],
      sy = o.y - p[a + 1],
      sz = o.z - p[a + 2];
    const u = (sx * hx + sy * hy + sz * hz) / det;
    if (u < 0 || u > 1) return false;
    const qx = sy * e1z - sz * e1y,
      qy = sz * e1x - sx * e1z,
      qz = sx * e1y - sy * e1x;
    const v = (d.x * qx + d.y * qy + d.z * qz) / det;
    if (v < 0 || u + v > 1) return false;
    const hit = (e2x * qx + e2y * qy + e2z * qz) / det;
    return hit >= 0 && hit < distance;
  }
}
