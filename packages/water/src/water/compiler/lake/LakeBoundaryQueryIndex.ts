import type { LakePointXZ, SampledLakeBoundary } from "../../authoring/lake/LakeBoundary";
type Edge = { a: LakePointXZ; b: LakePointXZ };
type Node = { minX: number; minZ: number; maxX: number; maxZ: number; edges?: Edge[]; left?: Node; right?: Node };
const squaredDistance = (n: Node, x: number, z: number) =>
  Math.max(n.minX - x, 0, x - n.maxX) ** 2 + Math.max(n.minZ - z, 0, z - n.maxZ) ** 2;
/** Exact edge BVH: acceleration never simplifies a shore or changes even/odd island ownership. */
export class LakeBoundaryQueryIndex {
  private readonly root: Node;
  constructor(rings: SampledLakeBoundary["rings"]) {
    const build = (edges: Edge[]): Node => {
      const node: Node = { minX: Infinity, minZ: Infinity, maxX: -Infinity, maxZ: -Infinity };
      for (const { a, b } of edges) {
        node.minX = Math.min(node.minX, a[0], b[0]);
        node.minZ = Math.min(node.minZ, a[1], b[1]);
        node.maxX = Math.max(node.maxX, a[0], b[0]);
        node.maxZ = Math.max(node.maxZ, a[1], b[1]);
      }
      if (edges.length <= 8) node.edges = edges;
      else {
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
  sample(x: number, z: number): number {
    let nearest = Infinity,
      inside = false;
    const visit = (node: Node): void => {
      const ray = node.minZ <= z && node.maxZ > z && node.maxX > x;
      const near = squaredDistance(node, x, z) <= nearest;
      if (!near && !ray) return;
      if (node.edges) {
        for (const { a, b } of node.edges) {
          if (near) {
            const dx = b[0] - a[0],
              dz = b[1] - a[1],
              t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz || 1)));
            nearest = Math.min(nearest, (x - a[0] - t * dx) ** 2 + (z - a[1] - t * dz) ** 2);
          }
          if (ray && a[1] > z !== b[1] > z && x < a[0] + ((z - a[1]) * (b[0] - a[0])) / (b[1] - a[1])) inside = !inside;
        }
      } else {
        const a = node.left!,
          b = node.right!;
        if (squaredDistance(a, x, z) < squaredDistance(b, x, z)) {
          visit(a);
          visit(b);
        } else {
          visit(b);
          visit(a);
        }
      }
    };
    visit(this.root);
    const distance = Math.sqrt(nearest);
    return distance < 1e-8 ? 0 : inside ? distance : -distance;
  }
}
