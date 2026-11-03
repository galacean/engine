import { sampleWaterTerrainHeight } from "../../authoring/terrain/WaterTerrainSnapshot";
import { insideRiverDropFootprint } from "../../authoring/river/RiverDrop";
import { minimumWaterTerrainHeight, WaterWetNearShoreSearch } from "../spatial/WaterWetNearShoreSearch";
import type { RiverCompiledData, ReadonlyVector3Tuple } from "../../compiler/river/types";
import { RIVER_QUERY_SAMPLE_COMPONENT } from "../../compiler/river/constants";
import { RIVER_QUERY_EPSILON } from "./constants";
import { RiverQueryPrimitiveKind } from "../../compiler/river/RiverGeometryEnums";
import { clipRiverTriangle, riverTriangleIntersectsBounds, riverTriangleQueryVertices } from "./RiverTriangleQuery";
import {
  WATER_NEAR_SHORE_RADIUS_M,
  resetWaterNearShoreSample,
  waterNearShoreTask,
  type WaterNearShoreQuery,
  type WaterNearShoreSample
} from "../spatial/WaterNearShoreQuery";

type Triangle = [ReadonlyVector3Tuple, ReadonlyVector3Tuple, ReadonlyVector3Tuple];
type ShoreSample = { position: [number, number, number]; width: number; depth: number };
interface Bounds {
  minX: number;
  minZ: number;
  maxX: number;
  maxZ: number;
}
interface Slot extends Bounds {
  span?: readonly [ShoreSample, ShoreSample];
  spanPair: [ShoreSample, ShoreSample];
  height: number;
  flat: boolean;
  tree?: TriangleNode;
  filled: boolean;
  dry?: boolean;
  preparation?: Generator<void>;
  clipMinX: number;
  clipMinZ: number;
  clipMaxX: number;
  clipMaxZ: number;
  positions?: readonly ReadonlyVector3Tuple[];
  indices?: ArrayLike<number>;
  triStart: number;
  triEnd: number;
  triCap: number;
  list: Triangle[];
  alone: Slot[];
}
interface TriangleNode extends Bounds {
  triangle?: Triangle;
  left?: TriangleNode;
  right?: TriangleNode;
}
interface Node extends Bounds {
  maximumHeight?: number;
  primitives?: Slot[];
  left?: Node;
  right?: Node;
  geometryReady?: boolean;
}
const CLIP_LIMIT = 8;
const scratchA = new Float64Array(CLIP_LIMIT * 3);
const scratchB = new Float64Array(CLIP_LIMIT * 3);
function writeVertex(triangle: Triangle, index: number, source: Float64Array, offset: number): void {
  const point = triangle[index] as [number, number, number];
  point[0] = source[offset];
  point[1] = source[offset + 1];
  point[2] = source[offset + 2];
}
function clipPlane(
  poly: Float64Array,
  other: Float64Array,
  polyCount: number,
  axis: number,
  edge: number,
  sign: number
): number {
  let written = 0;
  for (let i = 0; i < polyCount; i++) {
    const p = i * 3,
      q = ((i + 1) % polyCount) * 3,
      insideP = sign * (poly[p + axis] - edge) >= 0,
      insideQ = sign * (poly[q + axis] - edge) >= 0;
    if (insideP) {
      other[written] = poly[p];
      other[written + 1] = poly[p + 1];
      other[written + 2] = poly[p + 2];
      written += 3;
    }
    if (insideP !== insideQ) {
      const t = (edge - poly[p + axis]) / (poly[q + axis] - poly[p + axis]);
      other[written] = poly[p] + t * (poly[q] - poly[p]);
      other[written + 1] = poly[p + 1] + t * (poly[q + 1] - poly[p + 1]);
      other[written + 2] = poly[p + 2] + t * (poly[q + 2] - poly[p + 2]);
      other[written + axis] = edge;
      written += 3;
    }
  }
  return written / 3;
}
/** Same expanded domain and Sutherland–Hodgman clip as the native helpers, without allocating. */
function clipExpanded(
  ax: number,
  ay: number,
  az: number,
  bx: number,
  by: number,
  bz: number,
  cx: number,
  cy: number,
  cz: number,
  minX: number,
  minZ: number,
  maxX: number,
  maxZ: number,
  out: Triangle[],
  count: number,
  limit: number
): number {
  const determinant = (bz - cz) * (ax - cx) + (cx - bx) * (az - cz);
  if (Math.abs(determinant) <= RIVER_QUERY_EPSILON) return count;
  scratchA[0] = ax + RIVER_QUERY_EPSILON * (ax - bx + (ax - cx));
  scratchA[1] = ay + RIVER_QUERY_EPSILON * (ay - by + (ay - cy));
  scratchA[2] = az + RIVER_QUERY_EPSILON * (az - bz + (az - cz));
  scratchA[3] = bx + RIVER_QUERY_EPSILON * (bx - ax + (bx - cx));
  scratchA[4] = by + RIVER_QUERY_EPSILON * (by - ay + (by - cy));
  scratchA[5] = bz + RIVER_QUERY_EPSILON * (bz - az + (bz - cz));
  scratchA[6] = cx + RIVER_QUERY_EPSILON * (cx - ax + (cx - bx));
  scratchA[7] = cy + RIVER_QUERY_EPSILON * (cy - ay + (cy - by));
  scratchA[8] = cz + RIVER_QUERY_EPSILON * (cz - az + (cz - bz));
  let inside = true;
  for (let i = 0; i < 3; i++) {
    const x = scratchA[i * 3],
      z = scratchA[i * 3 + 2];
    if (x < minX || x > maxX || z < minZ || z > maxZ) {
      inside = false;
      break;
    }
  }
  if (inside) {
    if (count >= limit) throw new Error("river near-shore triangle pool exhausted");
    writeVertex(out[count], 0, scratchA, 0);
    writeVertex(out[count], 1, scratchA, 3);
    writeVertex(out[count], 2, scratchA, 6);
    return count + 1;
  }
  let poly = scratchA,
    other = scratchB,
    polyCount = 3;
  polyCount = clipPlane(poly, other, polyCount, 0, minX, 1);
  let swap = poly;
  poly = other;
  other = swap;
  polyCount = clipPlane(poly, other, polyCount, 0, maxX, -1);
  swap = poly;
  poly = other;
  other = swap;
  polyCount = clipPlane(poly, other, polyCount, 2, minZ, 1);
  swap = poly;
  poly = other;
  other = swap;
  polyCount = clipPlane(poly, other, polyCount, 2, maxZ, -1);
  swap = poly;
  poly = other;
  other = swap;
  for (let i = 1; i + 1 < polyCount; i++) {
    if (count >= limit) throw new Error("river near-shore triangle pool exhausted");
    writeVertex(out[count], 0, poly, 0);
    writeVertex(out[count], 1, poly, i * 3);
    writeVertex(out[count], 2, poly, (i + 1) * 3);
    count++;
  }
  return count;
}
function boundsDistanceSquared(node: Bounds, x: number, z: number): number {
  return Math.max(node.minX - x, 0, x - node.maxX) ** 2 + Math.max(node.minZ - z, 0, z - node.maxZ) ** 2;
}
/** Static nearest points on the same compiled triangle domains as native queries,
 * including flat end cuts. Exact domains are materialized only when visited. */
export class RiverNearShoreQuery implements WaterNearShoreQuery {
  readonly radiusM = WATER_NEAR_SHORE_RADIUS_M;
  private root?: Node;
  private builds = 0;
  private tests = 0;
  private count = 0;
  private nativeReads = 0;
  private readonly wetHeight: (x: number, z: number) => number | undefined;
  private candidateX = 0;
  private candidateZ = 0;
  private candidateInteriorX = 0;
  private candidateInteriorZ = 0;
  private readonly physical = { distanceM: Infinity, surfaceHeight: NaN };
  private readonly nominal = { distanceM: Infinity, surfaceHeight: NaN };
  private preparation?: Generator<void, Node>;
  private wetSearch?: WaterWetNearShoreSearch;
  private constantHeight: number | undefined;
  private scalarContoursSafe = false;
  private slots: Slot[] = [];
  private slotCursor = 0;
  private samplePool: ShoreSample[] = [];
  private sampleCursor = 0;
  private coarseNodes: Node[] = [];
  private coarseCursor = 0;
  private levelA: Node[] = [];
  private levelB: Node[] = [];
  private triPool: Triangle[] = [];
  private readonly freeTriangles: Triangle[] = [];
  private triCursor = 0;
  private triNodes: TriangleNode[] = [];
  private triNodeCursor = 0;
  private preparedPrimitives = 0;
  private preparedTriangles = 0;
  private triLevelA: TriangleNode[] = [];
  private triLevelB: TriangleNode[] = [];
  private readonly support: Bounds = { minX: Infinity, minZ: Infinity, maxX: -Infinity, maxZ: -Infinity };
  private readonly emptyRoot: Node = {
    minX: Infinity,
    minZ: Infinity,
    maxX: -Infinity,
    maxZ: -Infinity,
    primitives: []
  };
  constructor(
    private readonly data: RiverCompiledData,
    wetHeight: (x: number, z: number) => number | undefined
  ) {
    this.wetHeight = (x, z) => {
      if (this.constantHeight !== undefined && this.data.terrain) {
        const bed = sampleWaterTerrainHeight(this.data.terrain, x, z);
        if (bed === undefined || bed >= this.constantHeight) return undefined;
      }
      this.nativeReads++;
      return wetHeight(x, z);
    };
    // Set up span metadata; triangle storage remains lazy until geometry is needed.
    this.layoutSlots();
    this.warmupNativeQuery();
    this.nativeReads = 0;
    // The first optimizing compile of the span walker is a multi-millisecond pause.
    // Pay it while the query is constructed, then leave the rest of the index cooperative.
    this.warmupPreparation();
  }
  private warmupPreparation(): void {
    this.preparation = this.buildNodes(this.primitives());
    for (let i = 0; i < 12000 && this.slotCursor < 512; i++) {
      const next = this.preparation.next();
      if (!next.done) continue;
      this.root = next.value;
      this.preparation = undefined;
      this.builds++;
      return;
    }
  }
  private warmupNativeQuery(): void {
    const triangle: Triangle = [
      [0, 0, 0],
      [1, 0, 0],
      [0, 0, 1]
    ];
    const position = this.data.reaches[0]?.artifact.surfaceGeometry.positions[0];
    // Geometry positions are not the counted query-sample buffer.
    if (position) {
      this.wetHeight(position[0], position[2]);
      this.wetHeight(position[0] + 1, position[2]);
    }
    for (let i = 0; i < 16; i++) this.testTriangle(triangle, position?.[0] ?? 0, position?.[2] ?? 0, this.nominal);
  }
  prepare = (now: () => number = () => performance.now(), budgetMs = 0.2): boolean => {
    if (this.root) return true;
    this.preparation ??= this.buildNodes(this.primitives());
    const start = now();
    for (let i = 0; i < 128; i++) {
      const next = this.preparation.next();
      if (next.done) {
        this.root = next.value;
        this.preparation = undefined;
        this.builds++;
        return true;
      }
      if (now() - start >= budgetMs) break;
    }
    return false;
  };
  private layoutSlots(): void {
    const index = this.data.queryIndex,
      kinds = index.primitiveKinds.borrowTypedArray(),
      sources = index.primitiveSourceIndices.borrowTypedArray();
    const caps: number[] = [];
    for (let primitive = 0; primitive < kinds.length; primitive++) {
      if (kinds[primitive] === RiverQueryPrimitiveKind.ReachSpan) {
        const reach = this.data.reaches[sources[primitive]],
          geometry = reach.artifact.surfaceGeometry,
          sampleCount = reach.artifact.querySource.sampleCount,
          row = sampleCount ? geometry.positions.length / sampleCount : 0,
          sourceTris = Number.isInteger(row) && row >= 2 ? (row - 1) * 2 : 0;
        caps.push(Math.max(1, sourceTris * 2));
      } else {
        const count = Math.floor(this.data.junctions[sources[primitive]].surfaceGeometry.drawCount / 3);
        for (let triangle = 0; triangle < count; triangle++) caps.push(CLIP_LIMIT);
      }
    }
    const blank = this.blankSample;
    let maxCap = 1;
    // Triangle storage grows only after a potentially wet span is visited.
    this.slots = caps.map((cap) => {
      const list: Triangle[] = new Array(cap);
      const slot: Slot = {
        minX: Infinity,
        minZ: Infinity,
        maxX: -Infinity,
        maxZ: -Infinity,
        spanPair: [blank, blank],
        height: 0,
        flat: false,
        filled: false,
        clipMinX: 0,
        clipMinZ: 0,
        clipMaxX: 0,
        clipMaxZ: 0,
        triStart: 0,
        triEnd: 0,
        triCap: cap,
        list,
        alone: []
      };
      slot.alone = [slot];
      maxCap = Math.max(maxCap, cap);
      return slot;
    });
    this.triLevelA = new Array(maxCap);
    this.triLevelB = new Array(maxCap);
    const leaves = Math.max(1, this.slots.length);
    // A binary tree of N leaves uses 2N-1 nodes. The arrays stay live across levels,
    // so pairing must ignore stale entries past the current count.
    this.coarseNodes = new Array(leaves * 2);
    for (let i = 0; i < this.coarseNodes.length; i++) this.coarseNodes[i] = { minX: 0, minZ: 0, maxX: 0, maxZ: 0 };
    this.levelA = new Array(leaves);
    this.levelB = new Array(leaves);
    this.samplePool = new Array(Math.max(1, kinds.length * 2));
    for (let i = 0; i < this.samplePool.length; i++) this.samplePool[i] = { position: [0, 0, 0], width: 0, depth: 0 };
    this.verifyClip();
  }
  private readonly blankSample: ShoreSample = { position: [0, 0, 0], width: 0, depth: 0 };
  private verifyClip(): void {
    const triangles: Triangle[] = [
      [
        [0, 0, 0],
        [0, 0, 0],
        [0, 0, 0]
      ],
      [
        [0, 0, 0],
        [0, 0, 0],
        [0, 0, 0]
      ],
      [
        [0, 0, 0],
        [0, 0, 0],
        [0, 0, 0]
      ],
      [
        [0, 0, 0],
        [0, 0, 0],
        [0, 0, 0]
      ],
      [
        [0, 0, 0],
        [0, 0, 0],
        [0, 0, 0]
      ],
      [
        [0, 0, 0],
        [0, 0, 0],
        [0, 0, 0]
      ],
      [
        [0, 0, 0],
        [0, 0, 0],
        [0, 0, 0]
      ],
      [
        [0, 0, 0],
        [0, 0, 0],
        [0, 0, 0]
      ]
    ];
    const sources: readonly (readonly [ReadonlyVector3Tuple, ReadonlyVector3Tuple, ReadonlyVector3Tuple])[] = [
      [
        [0, 0, 0],
        [1, 0, 0],
        [0, 0, 1]
      ],
      [
        [0, 1, 0],
        [4, 2, 0],
        [0, 3, 4]
      ],
      [
        [615.4140624999999, 0, 67.5],
        [615.9999999999999, 0, 68],
        [615.9999999999999, 0, 67.5]
      ]
    ];
    const boxes: readonly Bounds[] = [
      { minX: -1, minZ: -1, maxX: 2, maxZ: 2 },
      { minX: 0.2, minZ: -1, maxX: 0.8, maxZ: 3 },
      { minX: -10, minZ: -10, maxX: 10, maxZ: 10 }
    ];
    for (let repeat = 0; repeat < 8; repeat++)
      for (const [a, b, c] of sources)
        for (const box of boxes) {
          const produced = clipExpanded(
            a[0],
            a[1],
            a[2],
            b[0],
            b[1],
            b[2],
            c[0],
            c[1],
            c[2],
            box.minX,
            box.minZ,
            box.maxX,
            box.maxZ,
            triangles,
            0,
            triangles.length
          );
          const expected = clipRiverTriangle(riverTriangleQueryVertices(a, b, c), box);
          if (produced !== expected.length) throw new Error("river near-shore clip diverged");
          for (let i = 0; i < produced; i++)
            for (let k = 0; k < 3; k++)
              for (let axis = 0; axis < 3; axis++)
                if (triangles[i][k][axis] !== expected[i][k][axis]) throw new Error("river near-shore clip diverged");
        }
  }
  private takeSlot(): Slot {
    const slot = this.slots[this.slotCursor++];
    if (!slot) throw new Error("river near-shore primitive slot pool exhausted");
    return slot;
  }
  private takeSample(): ShoreSample {
    const sample = this.samplePool[this.sampleCursor++];
    if (!sample) throw new Error("river near-shore sample pool exhausted");
    return sample;
  }
  private readSample(values: ArrayLike<number>, stride: number, index: number, out: ShoreSample): void {
    const offset = index * stride,
      c = RIVER_QUERY_SAMPLE_COMPONENT,
      position = out.position as [number, number, number];
    position[0] = values[offset + c.x];
    position[1] = values[offset + c.y];
    position[2] = values[offset + c.z];
    out.width = values[offset + c.width];
    out.depth = values[offset + c.depth];
  }
  private *buildNodes(primitives: Generator<Slot | undefined>): Generator<void, Node> {
    let count = 0;
    const level = this.levelA;
    for (const primitive of primitives) {
      if (!primitive) {
        yield;
        continue;
      }
      const node = this.coarseNodes[this.coarseCursor++];
      if (!node) throw new Error("river near-shore node pool exhausted");
      node.minX = primitive.minX;
      node.minZ = primitive.minZ;
      node.maxX = primitive.maxX;
      node.maxZ = primitive.maxZ;
      node.maximumHeight = primitive.height;
      node.primitives = primitive.alone;
      node.left = undefined;
      node.right = undefined;
      level[count++] = node;
      yield;
    }
    let src = level,
      dst = this.levelB;
    while (count > 1) {
      let next = 0;
      for (let i = 0; i < count; i += 2) {
        const a = src[i],
          b = i + 1 < count ? src[i + 1] : undefined;
        if (!a) break;
        if (b) {
          const node = this.coarseNodes[this.coarseCursor++];
          if (!node) throw new Error("river near-shore node pool exhausted");
          node.minX = Math.min(a.minX, b.minX);
          node.minZ = Math.min(a.minZ, b.minZ);
          node.maxX = Math.max(a.maxX, b.maxX);
          node.maxZ = Math.max(a.maxZ, b.maxZ);
          node.maximumHeight = Math.max(a.maximumHeight ?? -Infinity, b.maximumHeight ?? -Infinity);
          node.left = a;
          node.right = b;
          node.primitives = undefined;
          dst[next++] = node;
        } else dst[next++] = a;
        yield;
      }
      count = next;
      const swap = src;
      src = dst;
      dst = swap;
    }
    return src[0] ?? this.emptyRoot;
  }
  private growTriangles(extra: number): void {
    for (let i = 0; i < extra; i++)
      this.triPool.push([
        [0, 0, 0],
        [0, 0, 0],
        [0, 0, 0]
      ]);
    const nodesNeeded = this.triPool.length * 2;
    while (this.triNodes.length < nodesNeeded) this.triNodes.push({ minX: 0, minZ: 0, maxX: 0, maxZ: 0 });
  }
  private bindTriangles(slot: Slot): void {
    if (slot.list[0]) return;
    const missing = slot.triCap - this.freeTriangles.length - (this.triPool.length - this.triCursor);
    if (missing > 0) this.growTriangles(Math.max(256, missing));
    for (let i = 0; i < slot.triCap; i++) {
      const triangle = this.freeTriangles.pop() ?? this.triPool[this.triCursor++];
      if (!triangle) throw new Error("river near-shore triangle pool exhausted");
      slot.list[i] = triangle;
    }
  }
  private clipSource(slot: Slot, offset: number, produced: number): number {
    const positions = slot.positions,
      indices = slot.indices;
    if (!positions || !indices) return produced;
    const a = positions[indices[offset]],
      b = positions[indices[offset + 1]],
      c = positions[indices[offset + 2]];
    if (!a || !b || !c) return produced;
    return clipExpanded(
      a[0],
      a[1],
      a[2],
      b[0],
      b[1],
      b[2],
      c[0],
      c[1],
      c[2],
      slot.clipMinX,
      slot.clipMinZ,
      slot.clipMaxX,
      slot.clipMaxZ,
      slot.list,
      produced,
      slot.triCap
    );
  }
  private finishFill(slot: Slot, produced: number): void {
    // Clipping reserves a worst-case fan. Reuse its unused triangles for the
    // next span instead of retaining two times the actual surface everywhere.
    for (let i = produced; i < slot.list.length; i++) this.freeTriangles.push(slot.list[i]);
    slot.list.length = produced;
    slot.tree = produced ? this.buildTriangleTree(slot) : undefined;
    slot.filled = true;
    this.preparedPrimitives++;
    this.preparedTriangles += produced;
  }
  private isDry(slot: Slot): boolean {
    return (slot.dry ??= !!this.data.terrain && minimumWaterTerrainHeight(this.data.terrain, slot, 64) >= slot.height);
  }
  private *ensureFilled(slot: Slot): Generator<undefined> {
    if (slot.filled) return;
    slot.preparation ??= this.fillTriangles(slot);
    while (!slot.filled) {
      slot.preparation.next();
      yield;
    }
    slot.preparation = undefined;
  }
  private *fillTriangles(slot: Slot): Generator<void> {
    this.bindTriangles(slot);
    let produced = 0,
      steps = 0;
    for (let i = slot.triStart; i + 2 < slot.triEnd; i += 3) {
      produced = this.clipSource(slot, i, produced);
      if (++steps % 4 === 0) yield;
    }
    this.finishFill(slot, produced);
  }
  private buildTriangleTree(slot: Slot): TriangleNode | undefined {
    const list = slot.list,
      count = list.length;
    if (!count) return undefined;
    const level = this.triLevelA;
    for (let i = 0; i < count; i++) {
      const triangle = list[i],
        node = this.triNodes[this.triNodeCursor++];
      if (!node) throw new Error("river near-shore triangle node pool exhausted");
      let minX = Infinity,
        maxX = -Infinity,
        minZ = Infinity,
        maxZ = -Infinity;
      for (let k = 0; k < 3; k++) {
        const point = triangle[k];
        minX = Math.min(minX, point[0]);
        maxX = Math.max(maxX, point[0]);
        minZ = Math.min(minZ, point[2]);
        maxZ = Math.max(maxZ, point[2]);
      }
      node.triangle = triangle;
      node.left = undefined;
      node.right = undefined;
      node.minX = minX;
      node.maxX = maxX;
      node.minZ = minZ;
      node.maxZ = maxZ;
      level[i] = node;
    }
    let remaining = count,
      src = level,
      dst = this.triLevelB;
    while (remaining > 1) {
      let next = 0;
      for (let i = 0; i < remaining; i += 2) {
        const a = src[i],
          b = i + 1 < remaining ? src[i + 1] : undefined;
        if (!a) break;
        if (!b) {
          dst[next++] = a;
          continue;
        }
        const node = this.triNodes[this.triNodeCursor++];
        if (!node) throw new Error("river near-shore triangle node pool exhausted");
        node.triangle = undefined;
        node.left = a;
        node.right = b;
        node.minX = Math.min(a.minX, b.minX);
        node.maxX = Math.max(a.maxX, b.maxX);
        node.minZ = Math.min(a.minZ, b.minZ);
        node.maxZ = Math.max(a.maxZ, b.maxZ);
        dst[next++] = node;
      }
      remaining = next;
      const swap = src;
      src = dst;
      dst = swap;
    }
    return src[0];
  }
  private *primitives(): Generator<Slot | undefined> {
    const index = this.data.queryIndex,
      kinds = index.primitiveKinds.borrowTypedArray(),
      sources = index.primitiveSourceIndices.borrowTypedArray(),
      locals = index.primitiveLocalIndices.borrowTypedArray(),
      bounds = index.primitiveBounds.borrowTypedArray();
    const support = this.support;
    support.minX = Infinity;
    support.minZ = Infinity;
    support.maxX = -Infinity;
    support.maxZ = -Infinity;
    let uniformHeight: number | undefined;
    let uniform = true;
    let lastSource = -1,
      lastSample = -1,
      previous: ShoreSample | undefined;
    for (let primitive = 0; primitive < kinds.length; primitive++) {
      const offset = primitive * 4;
      // Same broad-phase acceptance as RiverNetworkQueryService._samplePrimitive.
      const clipMinX = bounds[offset] - RIVER_QUERY_EPSILON,
        clipMinZ = bounds[offset + 1] - RIVER_QUERY_EPSILON,
        clipMaxX = bounds[offset + 2] + RIVER_QUERY_EPSILON,
        clipMaxZ = bounds[offset + 3] + RIVER_QUERY_EPSILON;
      support.minX = Math.min(support.minX, clipMinX);
      support.maxX = Math.max(support.maxX, clipMaxX);
      support.minZ = Math.min(support.minZ, clipMinZ);
      support.maxZ = Math.max(support.maxZ, clipMaxZ);
      const sourceIndex = sources[primitive];
      if (kinds[primitive] === RiverQueryPrimitiveKind.ReachSpan) {
        const slot = this.takeSlot();
        const reach = this.data.reaches[sourceIndex],
          source = reach.artifact.querySource,
          values = source.samples.borrowTypedArray(),
          sampleIndex = locals[primitive];
        let a: ShoreSample;
        if (sourceIndex === lastSource && sampleIndex === lastSample) a = previous!;
        else {
          a = this.takeSample();
          this.readSample(values, source.stride, sampleIndex, a);
        }
        const b = this.takeSample();
        this.readSample(values, source.stride, sampleIndex + 1, b);
        lastSource = sourceIndex;
        lastSample = sampleIndex + 1;
        previous = b;
        // At most two samples are converted before yielding, even for a very long reach.
        yield;
        if (!this.data.terrain && Math.max(a.depth, b.depth) <= 0) continue;
        const geometry = reach.artifact.surfaceGeometry,
          row = geometry.positions.length / source.sampleCount;
        if (!Number.isInteger(row) || row < 2) continue;
        const start = geometry.drawStart + sampleIndex * (row - 1) * 6,
          end = Math.min(start + (row - 1) * 6, geometry.drawStart + geometry.drawCount),
          indices = geometry.indices.borrowTypedArray(),
          positions = geometry.positions;
        slot.minX = Infinity;
        slot.minZ = Infinity;
        slot.maxX = -Infinity;
        slot.maxZ = -Infinity;
        let minimumY = Infinity,
          maximumY = -Infinity;
        for (let i = start; i < end; i++) {
          const vertex = positions[indices[i]];
          minimumY = Math.min(minimumY, vertex[1]);
          maximumY = Math.max(maximumY, vertex[1]);
          slot.minX = Math.min(slot.minX, vertex[0]);
          slot.maxX = Math.max(slot.maxX, vertex[0]);
          slot.minZ = Math.min(slot.minZ, vertex[2]);
          slot.maxZ = Math.max(slot.maxZ, vertex[2]);
          // A cold cross-section read must not be one indivisible slice step.
          if (((i - start) & 15) === 15) yield;
        }
        // Any native tolerant triangle coordinate is bounded by its vertex range
        // plus two barycentric epsilon contributions. This box is only broad phase.
        const dx = (slot.maxX - slot.minX) * 2 * RIVER_QUERY_EPSILON,
          dz = (slot.maxZ - slot.minZ) * 2 * RIVER_QUERY_EPSILON;
        slot.minX = Math.max(clipMinX, slot.minX - dx);
        slot.maxX = Math.min(clipMaxX, slot.maxX + dx);
        slot.minZ = Math.max(clipMinZ, slot.minZ - dz);
        slot.maxZ = Math.min(clipMaxZ, slot.maxZ + dz);
        if (uniformHeight === undefined) uniformHeight = minimumY;
        uniform &&= minimumY === maximumY && minimumY === uniformHeight;
        slot.spanPair[0] = a;
        slot.spanPair[1] = b;
        slot.span = slot.spanPair;
        slot.height = maximumY + 2 * RIVER_QUERY_EPSILON * (maximumY - minimumY);
        slot.flat = minimumY === maximumY;
        slot.positions = positions;
        slot.indices = indices;
        slot.triStart = start;
        slot.triEnd = end;
        slot.clipMinX = clipMinX;
        slot.clipMinZ = clipMinZ;
        slot.clipMaxX = clipMaxX;
        slot.clipMaxZ = clipMaxZ;
        slot.filled = false;
        slot.tree = undefined;
        // A compiled span has a bounded cross-section (32 native triangles).
        // Materialize only visited spans, then reuse the domains for hot queries.
        yield slot;
        this.count++;
      } else {
        const junction = this.data.junctions[sourceIndex],
          geometry = junction.surfaceGeometry,
          start = geometry.drawStart,
          end = start + geometry.drawCount,
          indices = geometry.indices.borrowTypedArray(),
          positions = geometry.positions;
        uniform = false;
        for (let i = start; i + 2 < end; i += 3) {
          const slot = this.takeSlot(),
            a = positions[indices[i]],
            b = positions[indices[i + 1]],
            c = positions[indices[i + 2]];
          slot.positions = positions;
          slot.indices = indices;
          slot.triStart = i;
          slot.triEnd = i + 3;
          slot.clipMinX = clipMinX;
          slot.clipMinZ = clipMinZ;
          slot.clipMaxX = clipMaxX;
          slot.clipMaxZ = clipMaxZ;
          slot.span = undefined;
          slot.filled = false;
          if (a && b && c) this.bindTriangles(slot);
          const produced = a && b && c ? this.clipSource(slot, i, 0) : 0;
          if (!produced) {
            yield;
            continue;
          }
          this.finishFill(slot, produced);
          let minX = Infinity,
            minZ = Infinity,
            maxX = -Infinity,
            maxZ = -Infinity,
            maxY = -Infinity;
          for (let t = 0; t < slot.list.length; t++)
            for (let k = 0; k < 3; k++) {
              const point = slot.list[t][k];
              minX = Math.min(minX, point[0]);
              maxX = Math.max(maxX, point[0]);
              minZ = Math.min(minZ, point[2]);
              maxZ = Math.max(maxZ, point[2]);
              maxY = Math.max(maxY, point[1]);
            }
          slot.minX = minX;
          slot.maxX = maxX;
          slot.minZ = minZ;
          slot.maxZ = maxZ;
          slot.height = maxY;
          slot.flat = a[1] === b[1] && b[1] === c[1];
          yield slot;
          this.count++;
        }
      }
    }
    if (this.slotCursor !== this.slots.length) throw new Error("river near-shore slot layout diverged");
    this.constantHeight = uniform ? uniformHeight : undefined;
    // Scalar isolines suffice only for affine bed cells. Check the relevant
    // immutable terrain region cooperatively; curved bilinear cells retain the
    // general native search, including its conservative no-water proof.
    if (uniform && this.data.terrain && !this.data.connections?.length && !this.data.drops?.length) {
      this.scalarContoursSafe = true;
      let work = 0;
      for (const grid of [this.data.terrain, ...(this.data.terrain.refinements ?? [])]) {
        const sz = grid.spacingZ ?? grid.spacing;
        const x0 = Math.max(0, Math.floor((support.minX - grid.origin[0]) / grid.spacing));
        const x1 = Math.min(grid.columns - 2, Math.floor((support.maxX - grid.origin[0]) / grid.spacing));
        const z0 = Math.max(0, Math.floor((support.minZ - grid.origin[1]) / sz));
        const z1 = Math.min(grid.rows - 2, Math.floor((support.maxZ - grid.origin[1]) / sz));
        for (let z = z0; z <= z1 && this.scalarContoursSafe; z++)
          for (let x = x0; x <= x1; x++) {
            const i = z * grid.columns + x,
              h = grid.heights;
            if (h[i] + h[i + grid.columns + 1] !== h[i + 1] + h[i + grid.columns]) {
              this.scalarContoursSafe = false;
              break;
            }
            if (++work % 32 === 0) yield;
          }
        if (!this.scalarContoursSafe) break;
      }
    }
  }

  /** Geometry candidates only bound the source. The canonical bed domain is
   * extracted once for this compile, never once per overlapping span. */
  private createWetSearch(): WaterWetNearShoreSearch {
    let previous: Bounds | undefined,
      maximum = -Infinity;
    const maximumHeight = (box: Bounds): number => {
      if (previous === box) return maximum;
      previous = box;
      maximum = -Infinity;
      const visit = (node: Node): void => {
        if ((node.maximumHeight ?? -Infinity) <= maximum) return;
        if (node.maxX < box.minX || node.minX > box.maxX || node.maxZ < box.minZ || node.minZ > box.maxZ) return;
        if (node.primitives)
          for (const p of node.primitives) {
            if (p.span && !this.data.terrain) {
              const [a, b] = p.span,
                x = (box.minX + box.maxX) / 2,
                z = (box.minZ + box.maxZ) / 2;
              const lengthSquared = (b.position[0] - a.position[0]) ** 2 + (b.position[2] - a.position[2]) ** 2;
              const lipschitz =
                1 +
                (lengthSquared > RIVER_QUERY_EPSILON
                  ? Math.abs(b.width - a.width) / (2 * Math.sqrt(lengthSquared))
                  : 0);
              this.physical.distanceM = Infinity;
              this.testSpan(a, b, x, z, this.physical);
              const radius = Math.hypot(Math.max(x - box.minX, box.maxX - x), Math.max(z - box.minZ, box.maxZ - z));
              if (this.physical.distanceM > (radius * lipschitz) ** 2) continue;
            }
            const intersect = (node: TriangleNode): void => {
              if (node.maxX < box.minX || node.minX > box.maxX || node.maxZ < box.minZ || node.minZ > box.maxZ) return;
              if (node.triangle) {
                if (!riverTriangleIntersectsBounds(node.triangle, box)) return;
                if (p.flat) maximum = Math.max(maximum, p.height);
                else
                  for (const clipped of clipRiverTriangle(node.triangle, box))
                    for (const vertex of clipped) maximum = Math.max(maximum, vertex[1]);
              } else {
                if (node.left) intersect(node.left);
                if (node.right && (!p.flat || maximum < p.height)) intersect(node.right);
              }
            };
            if (p.tree) intersect(p.tree);
          }
        else {
          if (node.left) visit(node.left);
          if (node.right) visit(node.right);
        }
      };
      visit(this.root!);
      return maximum;
    };
    const geometrySamples = function* (root: Node, box: Bounds): Generator<readonly [number, number]> {
      if (root.maxX < box.minX || root.minX > box.maxX || root.maxZ < box.minZ || root.minZ > box.maxZ) return;
      if (root.primitives) {
        for (const p of root.primitives) {
          if (!p.filled) continue;
          for (const triangle of p.list) {
            if (!riverTriangleIntersectsBounds(triangle, box)) continue;
            for (const clipped of clipRiverTriangle(triangle, box))
              yield [
                (clipped[0][0] + clipped[1][0] + clipped[2][0]) / 3,
                (clipped[0][2] + clipped[1][2] + clipped[2][2]) / 3
              ];
          }
        }
      } else {
        if (root.left) yield* geometrySamples(root.left, box);
        if (root.right) yield* geometrySamples(root.right, box);
      }
    };
    return new WaterWetNearShoreSearch(
      this.root!,
      maximumHeight,
      this.wetHeight,
      (box) => maximumHeight(box) > -Infinity,
      this.data.terrain,
      this.data.connections,
      (box) =>
        !this.data.drops?.some(
          (drop) =>
            insideRiverDropFootprint(drop, box.minX, box.minZ) &&
            insideRiverDropFootprint(drop, box.minX, box.maxZ) &&
            insideRiverDropFootprint(drop, box.maxX, box.minZ) &&
            insideRiverDropFootprint(drop, box.maxX, box.maxZ)
        ),
      undefined,
      undefined,
      undefined,
      {
        maximumHeightBound: this.root!.maximumHeight,
        prepareGeometry: (box) => this.prepareGeometry(box),
        ...(this.scalarContoursSafe
          ? {
              contourDatum: this.constantHeight,
              clipContour: (a: readonly [number, number], b: readonly [number, number]) => this.clipContour(a, b)
            }
          : { samples: (box: Bounds) => geometrySamples(this.root!, box) })
      }
    );
  }
  /** Geometry predicates only read completed slots. Their cold construction stays
   * in the caller's cooperative traversal, after a conservative bed rejection. */
  private *prepareGeometry(box: Bounds): Generator<void> {
    if (this.root!.geometryReady) return;
    const stack = [this.root!];
    while (stack.length) {
      const node = stack.pop()!;
      if (node.geometryReady) continue;
      yield;
      if (node.maxX < box.minX || node.minX > box.maxX || node.maxZ < box.minZ || node.minZ > box.maxZ) continue;
      if (node.primitives) {
        for (const slot of node.primitives) {
          if (!slot.filled && !this.isDry(slot)) yield* this.ensureFilled(slot);
        }
        node.geometryReady = true;
      } else {
        // Readiness only moves forward for this immutable compile. Once a
        // subtree is complete, later terrain cells need no preparation walk.
        if (node.left?.geometryReady && node.right?.geometryReady) {
          node.geometryReady = true;
          continue;
        }
        if (node.right) stack.push(node.right);
        if (node.left) stack.push(node.left);
      }
    }
  }
  private *clipContour(
    a: readonly [number, number],
    b: readonly [number, number]
  ): Generator<readonly [readonly [number, number], readonly [number, number]] | undefined> {
    const box: Bounds = {
      minX: Math.min(a[0], b[0]),
      maxX: Math.max(a[0], b[0]),
      minZ: Math.min(a[1], b[1]),
      maxZ: Math.max(a[1], b[1])
    };
    const intervals: [number, number][] = [];
    // One traversal stack per contour, not a generator object per visited node.
    // Stacks belong to this continuation so interleaved queries cannot overwrite them.
    const nodes = [this.root!];
    const triangles: TriangleNode[] = [];
    let work = 0;
    while (nodes.length) {
      const node = nodes.pop()!;
      if (++work === 8) {
        work = 0;
        yield;
      }
      if (node.maxX < box.minX || node.minX > box.maxX || node.maxZ < box.minZ || node.minZ > box.maxZ) continue;
      if (!node.primitives) {
        if (node.right) nodes.push(node.right);
        if (node.left) nodes.push(node.left);
        continue;
      }
      for (const slot of node.primitives) {
        if (this.isDry(slot)) continue;
        if (!slot.filled) yield* this.ensureFilled(slot);
        if (slot.tree) triangles.push(slot.tree);
        while (triangles.length) {
          const candidate = triangles.pop()!;
          if (++work === 8) {
            work = 0;
            yield;
          }
          if (
            candidate.maxX < box.minX ||
            candidate.minX > box.maxX ||
            candidate.maxZ < box.minZ ||
            candidate.minZ > box.maxZ
          )
            continue;
          const triangle = candidate.triangle;
          if (!triangle) {
            if (candidate.right) triangles.push(candidate.right);
            if (candidate.left) triangles.push(candidate.left);
            continue;
          }
          if (!riverTriangleIntersectsBounds(triangle, box)) continue;
          const u = triangle[0],
            v = triangle[1],
            w = triangle[2];
          const sign = (v[0] - u[0]) * (w[2] - u[2]) - (v[2] - u[2]) * (w[0] - u[0]) >= 0 ? 1 : -1;
          let lo = 0,
            hi = 1;
          for (let i = 0; i < 3 && lo <= hi; i++) {
            const p = triangle[i],
              q = triangle[(i + 1) % 3],
              dx = q[0] - p[0],
              dz = q[2] - p[2];
            const start = sign * (dx * (a[1] - p[2]) - dz * (a[0] - p[0]));
            const end = sign * (dx * (b[1] - p[2]) - dz * (b[0] - p[0]));
            if (start < 0 && end < 0) {
              lo = 1;
              hi = 0;
              break;
            }
            if (start < 0) lo = Math.max(lo, start / (start - end));
            else if (end < 0) hi = Math.min(hi, start / (start - end));
          }
          if (lo <= hi) intervals.push([lo, hi]);
        }
      }
    }
    intervals.sort((a, b) => a[0] - b[0]);
    const point = (t: number): readonly [number, number] => [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])];
    let current: [number, number] | undefined;
    for (const range of intervals) {
      if (current && range[0] <= current[1]) current[1] = Math.max(current[1], range[1]);
      else {
        if (current) yield [point(current[0]), point(current[1])];
        current = range;
      }
      yield;
    }
    if (current) yield [point(current[0]), point(current[1])];
  }
  diagnostics() {
    return {
      builds: this.builds,
      nativeReads: this.nativeReads,
      primitiveCount: this.count,
      preparedPrimitives: this.preparedPrimitives,
      preparedTriangles: this.preparedTriangles,
      triangleCapacity: this.triPool.length,
      lastPrimitiveTests: this.tests,
      wet: this.wetSearch?.diagnostics()
    };
  }

  createTask(x: number, z: number, out: WaterNearShoreSample) {
    return waterNearShoreTask(this.search(x, z, out));
  }
  sample(x: number, z: number, out: WaterNearShoreSample): boolean {
    const task = this.createTask(x, z, out);
    while (!task.advance()) {
      /* Direct API; frame consumers advance one continuation. */
    }
    return task.hit;
  }
  private *search(x: number, z: number, out: WaterNearShoreSample): Generator<void, boolean> {
    resetWaterNearShoreSample(out);
    yield;
    this.tests = 0;
    if (!Number.isFinite(x) || !Number.isFinite(z)) return false;
    while (!this.prepare()) {
      yield;
    }
    const height = this.wetHeight(x, z);
    if (height !== undefined) {
      out.distanceM = 0;
      out.surfaceHeight = height;
      return true;
    }
    // The output temporarily holds squared distance, avoiding per-query scratch allocation.
    out.distanceM = (this.radiusM + 1e-7) ** 2;
    const minimum = yield* this.visit(this.root!, x, z, out);
    if (
      minimum <= (this.radiusM + 1e-7) ** 2 &&
      (!Number.isFinite(out.surfaceHeight) || Math.sqrt(out.distanceM) - Math.sqrt(minimum) > 1e-6)
    ) {
      this.wetSearch ??= this.createWetSearch();
      yield* this.wetSearch.search(x, z, out);
    }
    if (!Number.isFinite(out.surfaceHeight)) {
      resetWaterNearShoreSample(out);
      return false;
    }
    out.distanceM = Math.sqrt(out.distanceM);
    return true;
  }
  private *visit(root: Node, x: number, z: number, out: WaterNearShoreSample): Generator<void, number> {
    const stack = [root];
    let minimum = Infinity;
    while (stack.length) {
      const node = stack.pop()!;
      yield;
      if (boundsDistanceSquared(node, x, z) > out.distanceM) continue;
      if (node.primitives) {
        for (const p of node.primitives) {
          if (boundsDistanceSquared(p, x, z) > out.distanceM) continue;
          if (this.isDry(p)) {
            // Keep a conservative source-distance bound so the shared wet index
            // can publish/cache its empty result without materializing this span.
            minimum = Math.min(minimum, boundsDistanceSquared(p, x, z));
            continue;
          }
          this.tests++;
          if (!p.filled) yield* this.ensureFilled(p);
          yield;
          if (this.constantHeight !== undefined && this.data.terrain) {
            for (const triangle of p.list) {
              this.nominal.distanceM = Infinity;
              this.nominal.surfaceHeight = NaN;
              this.testTriangle(triangle, x, z, this.nominal);
              minimum = Math.min(minimum, this.nominal.distanceM);
              if (this.nominal.distanceM > out.distanceM) continue;
              const wx = this.candidateX,
                wz = this.candidateZ;
              const height = this.wetHeight(wx, wz);
              if (height !== undefined) this.consider(this.nominal.distanceM, height, out, wx, wz);
            }
          } else {
            this.testWetCandidate(p, x, z, out);
            minimum = Math.min(minimum, this.nominal.distanceM);
          }
        }
      } else if (node.left && node.right) {
        const left = node.left,
          right = node.right;
        if (boundsDistanceSquared(left, x, z) <= boundsDistanceSquared(right, x, z)) {
          stack.push(right, left);
        } else {
          stack.push(left, right);
        }
      }
    }
    return minimum;
  }

  private testWetCandidate(p: Slot, x: number, z: number, out: WaterNearShoreSample): boolean {
    const n = this.nominal;
    n.distanceM = Infinity;
    n.surfaceHeight = NaN;
    this.testPrimitive(p, x, z, n);
    if (n.distanceM > out.distanceM) return true;
    const heightAt = this.wetHeight;
    let wx = this.candidateX,
      wz = this.candidateZ,
      height = heightAt(wx, wz);
    if (height === undefined && p.span && !this.data.terrain) {
      this.physical.distanceM = Infinity;
      this.physical.surfaceHeight = NaN;
      this.testSpan(p.span[0], p.span[1], x, z, this.physical);
      // A radial profile candidate may lie outside the flat mesh end. Keep
      // the triangle candidate unless the two domains meet at the same distance.
      if (Math.abs(Math.sqrt(this.physical.distanceM) - Math.sqrt(n.distanceM)) <= 1e-6) {
        wx = this.candidateX;
        wz = this.candidateZ;
        height = heightAt(wx, wz);
      }
    }
    if (height === undefined) {
      const span = p.span;
      const cx = span ? (span[0].position[0] + span[1].position[0]) / 2 : this.candidateInteriorX;
      const cz = span ? (span[0].position[2] + span[1].position[2]) / 2 : this.candidateInteriorZ;
      const length = Math.hypot(cx - wx, cz - wz);
      if (length > 0) {
        wx += (cx - wx) * Math.min(1, 1e-9 / length);
        wz += (cz - wz) * Math.min(1, 1e-9 / length);
        height = heightAt(wx, wz);
      }
    }
    if (height !== undefined && Math.hypot(wx - x, wz - z) - Math.sqrt(n.distanceM) <= 1e-6) {
      this.consider((wx - x) ** 2 + (wz - z) ** 2, height, out, wx, wz);
      return true;
    }
    return false;
  }
  private testPrimitive(p: Slot, x: number, z: number, out: WaterNearShoreSample): void {
    {
      if (p.tree) this.testTriangleNode(p.tree, x, z, out);
      if (p.span && !this.data.terrain) {
        // Without a canonical bed, positive native profile depth additionally
        // requires the centreline/half-width domain. The distance to their
        // intersection is bounded below by the larger of the two distances.
        const px = this.candidateX,
          pz = this.candidateZ,
          ix = this.candidateInteriorX,
          iz = this.candidateInteriorZ;
        this.physical.distanceM = Infinity;
        this.physical.surfaceHeight = NaN;
        this.testSpan(p.span[0], p.span[1], x, z, this.physical);
        const [a, b] = p.span,
          lengthSquared = (b.position[0] - a.position[0]) ** 2 + (b.position[2] - a.position[2]) ** 2,
          lipschitz =
            1 +
            (lengthSquared > RIVER_QUERY_EPSILON ? Math.abs(b.width - a.width) / (2 * Math.sqrt(lengthSquared)) : 0),
          lowerDistance = this.physical.distanceM / (lipschitz * lipschitz);
        // With varying width the radial gap is not Euclidean distance. Divide
        // by its Lipschitz bound so it cannot prune a closer positive-depth point.
        if (lowerDistance > out.distanceM) {
          out.distanceM = lowerDistance;
          out.surfaceHeight = this.physical.surfaceHeight;
        } else {
          this.candidateX = px;
          this.candidateZ = pz;
          this.candidateInteriorX = ix;
          this.candidateInteriorZ = iz;
        }
      }
    }
  }
  private testSpan(sa: ShoreSample, sb: ShoreSample, x: number, z: number, out: WaterNearShoreSample): void {
    const a = sa.position,
      b = sb.position,
      dx = b[0] - a[0],
      dz = b[2] - a[2];
    const lengthSquared = dx * dx + dz * dz;
    const t =
      lengthSquared > RIVER_QUERY_EPSILON
        ? Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[2]) * dz) / lengthSquared))
        : 0;
    const halfWidth = (sa.width + t * (sb.width - sa.width)) / 2;
    const distance = Math.max(0, Math.hypot(x - (a[0] + t * dx), z - (a[2] + t * dz)) - halfWidth);
    const cx = a[0] + t * dx,
      cz = a[2] + t * dz,
      l = Math.hypot(x - cx, z - cz),
      ratio = l > 0 ? Math.min(1, halfWidth / l) : 0;
    this.consider(distance ** 2, a[1] + t * (b[1] - a[1]), out, cx + (x - cx) * ratio, cz + (z - cz) * ratio);
  }
  private consider(
    distanceSquared: number,
    height: number,
    out: WaterNearShoreSample,
    px = 0,
    pz = 0,
    interiorX = px,
    interiorZ = pz
  ): void {
    if (distanceSquared < out.distanceM || (distanceSquared === out.distanceM && !Number.isFinite(out.surfaceHeight))) {
      out.distanceM = distanceSquared;
      out.surfaceHeight = height;
      this.candidateX = px;
      this.candidateZ = pz;
      this.candidateInteriorX = interiorX;
      this.candidateInteriorZ = interiorZ;
    }
  }
  private testTriangleNode(node: TriangleNode, x: number, z: number, out: WaterNearShoreSample): void {
    if (boundsDistanceSquared(node, x, z) > out.distanceM) return;
    if (node.triangle) this.testTriangle(node.triangle, x, z, out);
    else if (node.left && node.right) {
      const a = node.left,
        b = node.right;
      if (boundsDistanceSquared(a, x, z) <= boundsDistanceSquared(b, x, z)) {
        this.testTriangleNode(a, x, z, out);
        this.testTriangleNode(b, x, z, out);
      } else {
        this.testTriangleNode(b, x, z, out);
        this.testTriangleNode(a, x, z, out);
      }
    }
  }
  private testTriangle(triangle: Triangle, x: number, z: number, out: WaterNearShoreSample): void {
    const a = triangle[0],
      b = triangle[1],
      c = triangle[2];
    const interiorX = (a[0] + b[0] + c[0]) / 3,
      interiorZ = (a[2] + b[2] + c[2]) / 3;
    const denominator = (b[2] - c[2]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[2] - c[2]);
    if (denominator !== 0) {
      const wa = ((b[2] - c[2]) * (x - c[0]) + (c[0] - b[0]) * (z - c[2])) / denominator;
      const wb = ((c[2] - a[2]) * (x - c[0]) + (a[0] - c[0]) * (z - c[2])) / denominator;
      const wc = 1 - wa - wb;
      if (wa >= 0 && wb >= 0 && wc >= 0) {
        this.consider(0, wa * a[1] + wb * b[1] + wc * c[1], out, x, z, interiorX, interiorZ);
        return;
      }
    }
    for (let i = 0; i < 3; i++) {
      const p = triangle[i],
        q = triangle[(i + 1) % 3],
        dx = q[0] - p[0],
        dz = q[2] - p[2];
      const t = Math.max(0, Math.min(1, ((x - p[0]) * dx + (z - p[2]) * dz) / (dx * dx + dz * dz || 1)));
      this.consider(
        (x - p[0] - t * dx) ** 2 + (z - p[2] - t * dz) ** 2,
        p[1] + t * (q[1] - p[1]),
        out,
        p[0] + t * dx,
        p[2] + t * dz,
        interiorX,
        interiorZ
      );
    }
  }
}
const queries = new WeakMap<RiverCompiledData, RiverNearShoreQuery>();
export function riverNearShoreQuery(
  data: RiverCompiledData,
  createWetHeight: () => (x: number, z: number) => number | undefined
): RiverNearShoreQuery {
  let query = queries.get(data);
  if (!query) {
    query = new RiverNearShoreQuery(data, createWetHeight());
    queries.set(data, query);
  }
  return query;
}
