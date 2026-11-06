import type { PlanPoint } from "./IslandPlanModel";
import { pointInPolygon, segmentDistance } from "../geometry/V2Geometry";
import { crosses, segmentGap } from "./WorldPlanningGeometry";
interface Bounds {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}
interface Edge extends Bounds {
  a: PlanPoint;
  b: PlanPoint;
}
interface Node extends Bounds {
  edges?: Edge[];
  left?: Node;
  right?: Node;
}
const bounds = (edges: Edge[]): Bounds => {
  let minX = Infinity,
    maxX = -Infinity,
    minZ = Infinity,
    maxZ = -Infinity;
  for (const e of edges) {
    minX = Math.min(minX, e.minX);
    maxX = Math.max(maxX, e.maxX);
    minZ = Math.min(minZ, e.minZ);
    maxZ = Math.max(maxZ, e.maxZ);
  }
  return { minX, maxX, minZ, maxZ };
};
const intersects = (a: Bounds, b: Bounds, padding = 0) =>
  a.maxX + padding >= b.minX && b.maxX + padding >= a.minX && a.maxZ + padding >= b.minZ && b.maxZ + padding >= a.minZ;
const pointBounds = (p: PlanPoint): Bounds => ({ minX: p.x, maxX: p.x, minZ: p.z, maxZ: p.z });
const segmentBounds = (a: PlanPoint, b: PlanPoint): Bounds => ({
  minX: Math.min(a.x, b.x),
  maxX: Math.max(a.x, b.x),
  minZ: Math.min(a.z, b.z),
  maxZ: Math.max(a.z, b.z)
});
function build(edges: Edge[]): Node {
  const box = bounds(edges);
  if (edges.length <= 8) return { ...box, edges };
  const x = box.maxX - box.minX >= box.maxZ - box.minZ;
  edges.sort((a, b) => (x ? a.minX + a.maxX - (b.minX + b.maxX) : a.minZ + a.maxZ - (b.minZ + b.maxZ)));
  const half = edges.length >>> 1;
  return { ...box, left: build(edges.slice(0, half)), right: build(edges.slice(half)) };
}
function someEdge(node: Node, query: Bounds, padding: number, test: (edge: Edge) => boolean): boolean {
  if (!intersects(node, query, padding)) return false;
  if (node.edges) {
    for (const edge of node.edges) if (intersects(edge, query, padding) && test(edge)) return true;
    return false;
  }
  return someEdge(node.left!, query, padding, test) || someEdge(node.right!, query, padding, test);
}
/** Per-call exact geometry queries. Indices must not survive mutation of their input rings. */
export class WorldPlanningWaterQuery {
  private readonly indices = new WeakMap<PlanPoint[], { tree: Node; edges: Edge[] }>();
  private index(ring: PlanPoint[]) {
    let index = this.indices.get(ring);
    if (!index) {
      const edges = ring.map((a, i) => {
        const b = ring[(i + 1) % ring.length];
        return { ...segmentBounds(a, b), a, b };
      });
      index = { tree: build([...edges]), edges };
      this.indices.set(ring, index);
    }
    return index;
  }
  /** Exact odd-even test over the existing edge tree. Prune rows that cannot meet the ray. */
  contains(p: PlanPoint, ring: PlanPoint[]): boolean {
    const { tree } = this.index(ring);
    if (!intersects(tree, pointBounds(p), 1e-7)) return false;
    let parity = false,
      boundary = false;
    const visit = (node: Node) => {
      if (boundary || p.z < node.minZ - 1e-7 || p.z > node.maxZ + 1e-7 || p.x > node.maxX + 1e-7) return;
      if (!node.edges) {
        visit(node.left!);
        visit(node.right!);
        return;
      }
      for (const e of node.edges) {
        const a = e.b,
          b = e.a,
          dx = b.x - a.x,
          dz = b.z - a.z,
          endX = a.x + dx,
          endZ = a.z + dz;
        if (
          p.x >= Math.min(a.x, endX) - 1e-7 &&
          p.x <= Math.max(a.x, endX) + 1e-7 &&
          p.z >= Math.min(a.z, endZ) - 1e-7 &&
          p.z <= Math.max(a.z, endZ) + 1e-7
        ) {
          const l = dx * dx + dz * dz,
            t = l > 0 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / l)) : 0,
            ex = p.x - (a.x + dx * t),
            ez = p.z - (a.z + dz * t);
          if (Math.abs(ex) < 1e-7 && Math.abs(ez) < 1e-7 && Math.hypot(ex, ez) < 1e-7) {
            boundary = true;
            return;
          }
        }
        if (a.z > p.z !== b.z > p.z && p.x < (dx * (p.z - a.z)) / dz + a.x) parity = !parity;
      }
    };
    visit(tree);
    return boundary || parity;
  }
  /** Exact boundary distance, pruning only edges whose bounds cannot improve the current minimum. */
  boundaryDistance(p: PlanPoint, ring: PlanPoint[]): number {
    const { tree } = this.index(ring);
    let best = Infinity;
    const lower = (n: Bounds) => Math.max(n.minX - p.x, 0, p.x - n.maxX, n.minZ - p.z, p.z - n.maxZ);
    const visit = (node: Node) => {
      if (lower(node) > best + 1e-9) return;
      if (node.edges) {
        for (const edge of node.edges)
          if (lower(edge) <= best + 1e-9) best = Math.min(best, segmentGap(p, edge.a, edge.b));
        return;
      }
      const a = node.left!,
        b = node.right!;
      if (lower(a) <= lower(b)) {
        visit(a);
        visit(b);
      } else {
        visit(b);
        visit(a);
      }
    };
    visit(tree);
    return best;
  }
  /** Whether the original segment-to-filled-polygon distance meets the supplied threshold. */
  segmentNear(a: PlanPoint, b: PlanPoint, ring: PlanPoint[], limit: number, inclusive: boolean): boolean {
    const { tree } = this.index(ring),
      box = segmentBounds(a, b);
    if (!intersects(tree, box, limit + 1e-7)) return false;
    if (this.contains(a, ring) || this.contains(b, ring)) return inclusive ? 0 <= limit : 0 < limit;
    return someEdge(tree, box, limit + 1e-9, (edge) => {
      const distance = segmentDistance(a, b, edge.a, edge.b);
      return inclusive ? distance <= limit : distance < limit;
    });
  }
  /** Same inclusive containment and proper-crossing decisions as the original overlap helper. */
  overlap(a: PlanPoint[], b: PlanPoint[]): boolean {
    const aa = this.index(a),
      bb = this.index(b);
    if (!intersects(aa.tree, bb.tree, 1e-7)) return false;
    for (const p of a) if (intersects(pointBounds(p), bb.tree, 1e-7) && this.contains(p, b)) return true;
    for (const p of b) if (intersects(pointBounds(p), aa.tree, 1e-7) && this.contains(p, a)) return true;
    for (const edge of aa.edges)
      if (someEdge(bb.tree, edge, 0, (other) => crosses(edge.a, edge.b, other.a, other.b))) return true;
    return false;
  }
}
