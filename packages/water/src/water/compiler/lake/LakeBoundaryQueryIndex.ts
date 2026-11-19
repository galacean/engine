import type { LakePointXZ, SampledLakeBoundary } from "../../authoring/lake/LakeBoundary";
type Edge = { a: LakePointXZ; b: LakePointXZ };
type Node = {
  minX: number;
  minZ: number;
  maxX: number;
  maxZ: number;
  coords?: Float64Array;
  left?: Node;
  right?: Node;
};
const squaredDistance = (n: Node, x: number, z: number): number => {
  const dx = x < n.minX ? n.minX - x : x > n.maxX ? x - n.maxX : 0;
  const dz = z < n.minZ ? n.minZ - z : z > n.maxZ ? z - n.maxZ : 0;
  return dx * dx + dz * dz;
};
const EPSILON = 1e-8;
const EPSILON_SQ = EPSILON * EPSILON;

/** Exact edge BVH: acceleration never simplifies a shore or changes even/odd island ownership. */
export class LakeBoundaryQueryIndex {
  private readonly root: Node;
  private readonly stack: Node[] = new Array(64);

  constructor(rings: SampledLakeBoundary["rings"]) {
    const build = (edges: Edge[]): Node => {
      const node: Node = { minX: Infinity, minZ: Infinity, maxX: -Infinity, maxZ: -Infinity };
      for (const { a, b } of edges) {
        if (a[0] < node.minX) node.minX = a[0];
        if (b[0] < node.minX) node.minX = b[0];
        if (a[1] < node.minZ) node.minZ = a[1];
        if (b[1] < node.minZ) node.minZ = b[1];
        if (a[0] > node.maxX) node.maxX = a[0];
        if (b[0] > node.maxX) node.maxX = b[0];
        if (a[1] > node.maxZ) node.maxZ = a[1];
        if (b[1] > node.maxZ) node.maxZ = b[1];
      }
      if (edges.length <= 8) {
        const coords = new Float64Array(edges.length * 4);
        for (let i = 0; i < edges.length; i++) {
          const { a, b } = edges[i];
          const o = i * 4;
          coords[o] = a[0];
          coords[o + 1] = a[1];
          coords[o + 2] = b[0];
          coords[o + 3] = b[1];
        }
        node.coords = coords;
      } else {
        const axis = node.maxX - node.minX >= node.maxZ - node.minZ ? 0 : 1;
        edges.sort((u, v) => u.a[axis] + u.b[axis] - v.a[axis] - v.b[axis]);
        const middle = edges.length >> 1;
        node.left = build(edges.slice(0, middle));
        node.right = build(edges.slice(middle));
      }
      return node;
    };
    this.root = build(rings.flatMap((r) => r.map((a, i) => ({ a, b: r[(i + 1) % r.length] }))));
  }

  /** Allocation-free exact signed distance: positive inside, negative outside. */
  sample(x: number, z: number): number {
    let nearest = Infinity;
    let inside = false;
    const stack = this.stack;
    let top = 0;
    stack[top++] = this.root;
    while (top > 0) {
      const node = stack[--top];
      const ray = node.minZ <= z && node.maxZ > z && node.maxX > x;
      const near = squaredDistance(node, x, z) <= nearest;
      if (!near && !ray) continue;
      const coords = node.coords;
      if (coords) {
        for (let i = 0, len = coords.length; i < len; i += 4) {
          const ax = coords[i];
          const az = coords[i + 1];
          const bx = coords[i + 2];
          const bz = coords[i + 3];
          if (near) {
            const dx = bx - ax;
            const dz = bz - az;
            const lenSq = dx * dx + dz * dz || 1;
            let t = ((x - ax) * dx + (z - az) * dz) / lenSq;
            if (t < 0) t = 0;
            else if (t > 1) t = 1;
            const ex = x - ax - t * dx;
            const ez = z - az - t * dz;
            const distSq = ex * ex + ez * ez;
            if (distSq < nearest) nearest = distSq;
          }
          if (ray && az > z !== bz > z && x < ax + ((z - az) * (bx - ax)) / (bz - az)) inside = !inside;
        }
      } else {
        const a = node.left!;
        const b = node.right!;
        // Push farther child first so LIFO pops nearer child first for tighter distance pruning.
        if (squaredDistance(a, x, z) < squaredDistance(b, x, z)) {
          stack[top++] = b;
          stack[top++] = a;
        } else {
          stack[top++] = a;
          stack[top++] = b;
        }
      }
    }
    const distance = Math.sqrt(nearest);
    return distance < EPSILON ? 0 : inside ? distance : -distance;
  }

  /**
   * Exact boolean equivalent of `sample(x, z) >= -tolerance` with bounded BVH pruning.
   * Preserves full even/odd parity across concave bays and inner dry islands.
   */
  containsOrWithinTolerance(x: number, z: number, tolerance = 0): boolean {
    const tol = tolerance > 0 ? tolerance : 0;
    const maxTol = tol > EPSILON ? tol : EPSILON;
    const root = this.root;
    if (x < root.minX - maxTol || x > root.maxX + maxTol || z < root.minZ - maxTol || z > root.maxZ + maxTol) {
      return false;
    }
    const tolSq = tol * tol;
    const maxDistSq = maxTol * maxTol;
    let inside = false;
    const stack = this.stack;
    let top = 0;
    stack[top++] = root;
    while (top > 0) {
      const node = stack[--top];
      const ray = node.minZ <= z && node.maxZ > z && node.maxX > x;
      const near = squaredDistance(node, x, z) <= maxDistSq;
      if (!near && !ray) continue;
      const coords = node.coords;
      if (coords) {
        for (let i = 0, len = coords.length; i < len; i += 4) {
          const ax = coords[i];
          const az = coords[i + 1];
          const bx = coords[i + 2];
          const bz = coords[i + 3];
          if (near) {
            const dx = bx - ax;
            const dz = bz - az;
            const lenSq = dx * dx + dz * dz || 1;
            let t = ((x - ax) * dx + (z - az) * dz) / lenSq;
            if (t < 0) t = 0;
            else if (t > 1) t = 1;
            const ex = x - ax - t * dx;
            const ez = z - az - t * dz;
            const distSq = ex * ex + ez * ez;
            if (distSq < EPSILON_SQ || (tol > 0 && distSq <= tolSq)) return true;
          }
          if (ray && az > z !== bz > z && x < ax + ((z - az) * (bx - ax)) / (bz - az)) inside = !inside;
        }
      } else {
        const a = node.left!;
        const b = node.right!;
        if (near && squaredDistance(a, x, z) < squaredDistance(b, x, z)) {
          stack[top++] = b;
          stack[top++] = a;
        } else {
          stack[top++] = a;
          stack[top++] = b;
        }
      }
    }
    return inside;
  }
}
