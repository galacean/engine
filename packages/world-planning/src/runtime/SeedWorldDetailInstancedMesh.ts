import {
  type BoundingBox,
  Buffer,
  BufferBindFlag,
  BufferMesh,
  BufferUsage,
  type Engine,
  IndexBufferBinding,
  IndexFormat,
  type ModelMesh,
  type Vector3,
  type VertexBufferBinding,
  VertexElement,
  VertexElementFormat
} from "@galacean/engine";

/** Number of floats in a compact Seed detail record: position, yaw, scale, coverage, and terrain normal. */
export const DETAIL_TRANSFORM_FLOATS = 13;
export const DETAIL_TRANSFORM_STRIDE_BYTES = DETAIL_TRANSFORM_FLOATS * Float32Array.BYTES_PER_ELEMENT;

const DETAIL_VERTEX_ELEMENTS_BY_SOURCE_MESH = new WeakMap<ModelMesh, VertexElement[]>();

interface ModelMeshPrimitiveInternals {
  readonly _primitive: {
    readonly indexBufferBinding: IndexBufferBinding | null;
  };
}

interface GrassLodIndexLayout {
  readonly engine: Engine;
  readonly indexBufferBinding: IndexBufferBinding;
  readonly lod0Start: number;
  readonly lod0Count: number;
  readonly lod1Start: number;
  readonly lod1Count: number;
  readonly lod2Start: number;
  readonly lod2Count: number;
}

/** Single-LOD instanced grass ring mesh sharing source geometry with an external Transform Feedback buffer. */
export interface SeedWorldForwardGrassRingMesh {
  readonly mesh: BufferMesh;
  readonly instanceBinding: number;
  readonly triangleCountPerInstance: number;
}

const GRASS_LOD_INDEX_LAYOUTS = new WeakMap<ModelMesh, GrassLodIndexLayout>();

/** GPU mesh view that shares the authored vertex and index buffers. */
export interface SeedWorldDetailInstancedMesh {
  readonly mesh: BufferMesh;
  instanceBuffer: Buffer;
  readonly instanceBinding: number;
  readonly lod0Start: number;
  readonly lod0Count: number;
  readonly lod1Start: number;
  readonly lod1Count: number;
  readonly lod2Start: number;
  readonly lod2Count: number;
}

/** Single-LOD instanced grass ring mesh sharing source geometry with an external Transform Feedback buffer. */
export interface SeedWorldForwardGrassRingMesh {
  readonly mesh: BufferMesh;
  readonly instanceBinding: number;
  readonly triangleCountPerInstance: number;
}

function edgeKey(a: number, b: number): string {
  return a < b ? `${a}:${b}` : `${b}:${a}`;
}

function distSq(a: Vector3, b: Vector3): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dz = a.z - b.z;
  return dx * dx + dy * dy + dz * dz;
}

function appendOrientedTriangle(
  positions: readonly Vector3[],
  i0: number,
  i1: number,
  i2: number,
  refX: number,
  refY: number,
  refZ: number,
  out: number[]
): void {
  const p0 = positions[i0]!;
  const p1 = positions[i1]!;
  const p2 = positions[i2]!;
  const ux = p1.x - p0.x,
    uy = p1.y - p0.y,
    uz = p1.z - p0.z;
  const vx = p2.x - p0.x,
    vy = p2.y - p0.y,
    vz = p2.z - p0.z;
  const nx = uy * vz - uz * vy;
  const ny = uz * vx - ux * vz;
  const nz = ux * vy - uy * vx;
  if (nx * refX + ny * refY + nz * refZ < 0) {
    out.push(i0, i2, i1);
  } else {
    out.push(i0, i1, i2);
  }
}

function buildSimplifiedGrassIndices(
  positions: readonly Vector3[],
  indices: ArrayLike<number>,
  tier: 1 | 2
): Uint16Array | Uint32Array | null {
  if (indices.length < 6 || indices.length % 3 !== 0 || positions.length === 0) {
    return null;
  }
  const faceCount = indices.length / 3;
  const vertexFaces = new Map<number, number[]>();
  for (let f = 0; f < faceCount; f++) {
    const base = f * 3;
    for (let k = 0; k < 3; k++) {
      const v = indices[base + k]!;
      let list = vertexFaces.get(v);
      if (!list) vertexFaces.set(v, (list = []));
      list.push(f);
    }
  }

  const visitedFaces = new Uint8Array(faceCount);
  const out: number[] = [];
  let reduced = false;
  let maxIndex = 0;
  let componentIndex = 0;

  for (let startFace = 0; startFace < faceCount; startFace++) {
    if (visitedFaces[startFace]) continue;
    const queue = [startFace];
    visitedFaces[startFace] = 1;
    const componentFaces: number[] = [];
    const componentVertices = new Set<number>();
    const edges = new Set<string>();

    for (let q = 0; q < queue.length; q++) {
      const f = queue[q]!;
      componentFaces.push(f);
      const base = f * 3;
      const i0 = indices[base]!;
      const i1 = indices[base + 1]!;
      const i2 = indices[base + 2]!;
      componentVertices.add(i0);
      componentVertices.add(i1);
      componentVertices.add(i2);
      edges.add(edgeKey(i0, i1));
      edges.add(edgeKey(i1, i2));
      edges.add(edgeKey(i2, i0));
      maxIndex = Math.max(maxIndex, i0, i1, i2);

      for (const v of [i0, i1, i2]) {
        const adj = vertexFaces.get(v);
        if (!adj) continue;
        for (let j = 0; j < adj.length; j++) {
          const nf = adj[j]!;
          if (!visitedFaces[nf]) {
            visitedFaces[nf] = 1;
            queue.push(nf);
          }
        }
      }
    }

    const bladeIndex = componentIndex++;
    // For LOD2, decimate every other blade after keeping at least the first blade.
    if (tier === 2 && bladeIndex > 0 && bladeIndex % 2 === 1) {
      reduced = true;
      continue;
    }

    if (componentFaces.length < 4 && tier === 1) {
      for (const f of componentFaces) {
        const base = f * 3;
        out.push(indices[base]!, indices[base + 1]!, indices[base + 2]!);
      }
      continue;
    }

    let refX = 0,
      refY = 0,
      refZ = 0;
    for (const f of componentFaces) {
      const base = f * 3;
      const p0 = positions[indices[base]!]!;
      const p1 = positions[indices[base + 1]!]!;
      const p2 = positions[indices[base + 2]!]!;
      const ux = p1.x - p0.x,
        uy = p1.y - p0.y,
        uz = p1.z - p0.z;
      const vx = p2.x - p0.x,
        vy = p2.y - p0.y,
        vz = p2.z - p0.z;
      refX += uy * vz - uz * vy;
      refY += uz * vx - ux * vz;
      refZ += ux * vy - uy * vx;
    }

    const sorted = Array.from(componentVertices).sort((a, b) => {
      const pa = positions[a]!;
      const pb = positions[b]!;
      return pa.y - pb.y || pa.x - pb.x || pa.z - pb.z;
    });
    const b0 = sorted[0]!;
    const b1 = sorted[1]!;
    const tA = sorted[sorted.length - 2]!;
    const tB = sorted[sorted.length - 1]!;

    if (tier === 1 && tA !== b0 && tA !== b1 && tB !== b0 && tB !== b1 && edges.has(edgeKey(tA, tB))) {
      const direct = distSq(positions[b0]!, positions[tA]!) + distSq(positions[b1]!, positions[tB]!);
      const swapped = distSq(positions[b0]!, positions[tB]!) + distSq(positions[b1]!, positions[tA]!);
      const [top0, top1] = direct <= swapped ? [tA, tB] : [tB, tA];
      appendOrientedTriangle(positions, b0, b1, top1, refX, refY, refZ, out);
      appendOrientedTriangle(positions, b0, top1, top0, refX, refY, refZ, out);
      reduced = true;
    } else if (tB !== b0 && tB !== b1) {
      appendOrientedTriangle(positions, b0, b1, tB, refX, refY, refZ, out);
      if (out.length / 3 < componentFaces.length) reduced = true;
    } else {
      for (const f of componentFaces) {
        const base = f * 3;
        out.push(indices[base]!, indices[base + 1]!, indices[base + 2]!);
      }
    }
  }

  if (!reduced || out.length === 0 || out.length >= indices.length) {
    return null;
  }
  return maxIndex <= 0xffff ? new Uint16Array(out) : new Uint32Array(out);
}

/**
 * Derives a mid/far grass-cluster LOD1 index buffer by collapsing each blade strip's
 * interior height rings into a single quad (or triangle if pointed), keeping base/tip extents.
 */
export function buildSimplifiedGrassLod1Indices(
  positions: readonly Vector3[],
  indices: ArrayLike<number>
): Uint16Array | Uint32Array | null {
  return buildSimplifiedGrassIndices(positions, indices, 1);
}

/**
 * Derives an ultra-light LOD2 grass-cluster index buffer (1 triangle per retained blade,
 * decimating half the blades in multi-blade tufts).
 */
export function buildSimplifiedGrassLod2Indices(
  positions: readonly Vector3[],
  indices: ArrayLike<number>
): Uint16Array | Uint32Array | null {
  return buildSimplifiedGrassIndices(positions, indices, 2);
}

function getGrassLodIndexLayout(
  engine: Engine,
  sourceMesh: ModelMesh,
  sourceIndexBinding: IndexBufferBinding
): GrassLodIndexLayout | undefined {
  const cached = GRASS_LOD_INDEX_LAYOUTS.get(sourceMesh);
  if (cached && cached.engine === engine && !cached.indexBufferBinding.buffer.destroyed) {
    return cached;
  }
  const subMesh = sourceMesh.subMeshes[0]!;
  if (subMesh.start !== 0 || sourceMesh.accessible === false) return undefined;
  const positions = typeof sourceMesh.getPositions === "function" ? sourceMesh.getPositions() : null;
  const rawIndices = typeof sourceMesh.getIndices === "function" ? sourceMesh.getIndices() : null;
  if (!positions || !rawIndices || rawIndices.length < subMesh.count) return undefined;
  const lod0Slice = rawIndices.length === subMesh.count ? rawIndices : rawIndices.subarray(0, subMesh.count);
  const lod1Indices = buildSimplifiedGrassLod1Indices(positions, lod0Slice);
  const lod2Indices = buildSimplifiedGrassLod2Indices(positions, lod0Slice);
  if (!lod1Indices && !lod2Indices) return undefined;

  const lod1Len = lod1Indices ? lod1Indices.length : 0;
  const lod2Len = lod2Indices ? lod2Indices.length : 0;
  const totalCount = subMesh.count + lod1Len + lod2Len;
  const useUInt32 =
    lod1Indices instanceof Uint32Array ||
    lod2Indices instanceof Uint32Array ||
    sourceIndexBinding.format === IndexFormat.UInt32;
  const combined = useUInt32 ? new Uint32Array(totalCount) : new Uint16Array(totalCount);
  for (let i = 0; i < subMesh.count; i++) combined[i] = lod0Slice[i]!;
  if (lod1Indices) combined.set(lod1Indices, subMesh.count);
  if (lod2Indices) combined.set(lod2Indices, subMesh.count + lod1Len);

  const indexBuffer = new Buffer(engine, BufferBindFlag.IndexBuffer, combined, BufferUsage.Static);
  const layout: GrassLodIndexLayout = {
    engine,
    indexBufferBinding: new IndexBufferBinding(indexBuffer, useUInt32 ? IndexFormat.UInt32 : IndexFormat.UInt16),
    lod0Start: 0,
    lod0Count: subMesh.count,
    lod1Start: lod1Len > 0 ? subMesh.count : 0,
    lod1Count: lod1Len,
    lod2Start: lod2Len > 0 ? subMesh.count + lod1Len : lod1Len > 0 ? subMesh.count : 0,
    lod2Count: lod2Len > 0 ? lod2Len : lod1Len
  };
  GRASS_LOD_INDEX_LAYOUTS.set(sourceMesh, layout);
  return layout;
}

function detailInstanceVertexElements(sourceMesh: ModelMesh): VertexElement[] {
  let elements = DETAIL_VERTEX_ELEMENTS_BY_SOURCE_MESH.get(sourceMesh);
  if (!elements) {
    const instanceBinding = sourceMesh.vertexBufferBindings.length;
    elements = [
      ...sourceMesh.vertexElements,
      new VertexElement("DETAIL_POSITION_ROTATION", 0, VertexElementFormat.Vector4, instanceBinding, 1),
      new VertexElement("DETAIL_SCALE", 16, VertexElementFormat.Vector3, instanceBinding, 1),
      new VertexElement("DETAIL_SURFACE_WEIGHTS", 28, VertexElementFormat.Vector3, instanceBinding, 1),
      new VertexElement("DETAIL_TERRAIN_NORMAL", 40, VertexElementFormat.Vector3, instanceBinding, 1)
    ];
    DETAIL_VERTEX_ELEMENTS_BY_SOURCE_MESH.set(sourceMesh, elements);
  }
  return elements;
}

/** Allocates one compact Detail mesh using the renderer layout shared by Seed vegetation. */
export function createSeedWorldDetailInstancedMesh(
  engine: Engine,
  sourceMesh: ModelMesh,
  transforms: Float32Array,
  instanceCount: number,
  bounds: BoundingBox,
  name: string,
  simplifyGrassLod1 = false
): SeedWorldDetailInstancedMesh {
  if (sourceMesh.blendShapeCount !== 0 || sourceMesh.subMeshes.length !== 1 || sourceMesh.subMeshes[0].count <= 0) {
    throw new Error("Seed World compact Detail instancing requires one non-skinned static primitive");
  }
  const transformFloatCount = instanceCount * DETAIL_TRANSFORM_FLOATS;
  if (!Number.isInteger(instanceCount) || instanceCount <= 0 || transformFloatCount > transforms.length) {
    throw new RangeError("Seed World compact Detail instance count exceeds transform storage");
  }
  const sourceIndexBinding = (sourceMesh as unknown as ModelMeshPrimitiveInternals)._primitive.indexBufferBinding;
  const subMesh = sourceMesh.subMeshes[0];
  const grassLodLayout =
    simplifyGrassLod1 && sourceIndexBinding
      ? getGrassLodIndexLayout(engine, sourceMesh, sourceIndexBinding)
      : undefined;
  const instanceBuffer = new Buffer(
    engine,
    BufferBindFlag.VertexBuffer,
    transformFloatCount * Float32Array.BYTES_PER_ELEMENT,
    BufferUsage.Dynamic
  );
  const mesh = new BufferMesh(engine, name);
  try {
    instanceBuffer.setData(transforms, 0, 0, transformFloatCount);
    sourceMesh.vertexBufferBindings.forEach((binding, index) => {
      if (binding) mesh.setVertexBufferBinding(binding, index);
    });
    const instanceBinding = sourceMesh.vertexBufferBindings.length;
    mesh.setVertexBufferBinding(instanceBuffer, DETAIL_TRANSFORM_STRIDE_BYTES, instanceBinding);
    mesh.setVertexElements(detailInstanceVertexElements(sourceMesh));
    if (grassLodLayout) {
      mesh.setIndexBufferBinding(grassLodLayout.indexBufferBinding);
      mesh.addSubMesh(grassLodLayout.lod0Start, grassLodLayout.lod0Count, subMesh.topology);
    } else {
      if (sourceIndexBinding) mesh.setIndexBufferBinding(sourceIndexBinding);
      mesh.addSubMesh(subMesh.start, subMesh.count, subMesh.topology);
    }
    mesh.bounds = bounds;
    mesh.instanceCount = instanceCount;
    return {
      mesh,
      instanceBuffer,
      instanceBinding,
      lod0Start: grassLodLayout ? grassLodLayout.lod0Start : subMesh.start,
      lod0Count: grassLodLayout ? grassLodLayout.lod0Count : subMesh.count,
      lod1Start: grassLodLayout ? grassLodLayout.lod1Start : subMesh.start,
      lod1Count: grassLodLayout ? grassLodLayout.lod1Count : 0,
      lod2Start: grassLodLayout ? grassLodLayout.lod2Start : subMesh.start,
      lod2Count: grassLodLayout ? grassLodLayout.lod2Count : 0
    };
  } catch (error) {
    mesh.destroy();
    instanceBuffer.destroy(true);
    throw error;
  }
}

/**
 * Builds an instanced grass mesh for one LOD tier (0, 1, or 2) whose per-instance
 * binding is driven directly by an external VertexBufferBinding (e.g. TransformFeedbackSimulator).
 */
export function createSeedWorldForwardGrassRingMesh(
  engine: Engine,
  sourceMesh: ModelMesh,
  initialInstanceBinding: VertexBufferBinding,
  bounds: BoundingBox,
  name: string,
  lodTier: 0 | 1 | 2
): SeedWorldForwardGrassRingMesh {
  if (sourceMesh.blendShapeCount !== 0 || sourceMesh.subMeshes.length !== 1 || sourceMesh.subMeshes[0].count <= 0) {
    throw new Error("Seed World forward grass requires one non-skinned static primitive");
  }
  const sourceIndexBinding = (sourceMesh as unknown as ModelMeshPrimitiveInternals)._primitive.indexBufferBinding;
  const subMesh = sourceMesh.subMeshes[0];
  const grassLodLayout = sourceIndexBinding
    ? getGrassLodIndexLayout(engine, sourceMesh, sourceIndexBinding)
    : undefined;
  let start = subMesh.start;
  let count = subMesh.count;
  if (grassLodLayout) {
    if (lodTier === 2 && grassLodLayout.lod2Count > 0) {
      start = grassLodLayout.lod2Start;
      count = grassLodLayout.lod2Count;
    } else if (lodTier >= 1 && grassLodLayout.lod1Count > 0) {
      start = grassLodLayout.lod1Start;
      count = grassLodLayout.lod1Count;
    } else {
      start = grassLodLayout.lod0Start;
      count = grassLodLayout.lod0Count;
    }
  }
  const mesh = new BufferMesh(engine, name);
  try {
    sourceMesh.vertexBufferBindings.forEach((binding, index) => {
      if (binding) mesh.setVertexBufferBinding(binding, index);
    });
    const instanceBinding = sourceMesh.vertexBufferBindings.length;
    mesh.setVertexBufferBinding(initialInstanceBinding, instanceBinding);
    mesh.setVertexElements(detailInstanceVertexElements(sourceMesh));
    if (grassLodLayout) {
      mesh.setIndexBufferBinding(grassLodLayout.indexBufferBinding);
    } else if (sourceIndexBinding) {
      mesh.setIndexBufferBinding(sourceIndexBinding);
    }
    mesh.addSubMesh(start, count, subMesh.topology);
    mesh.bounds = bounds;
    mesh.instanceCount = 0;
    return {
      mesh,
      instanceBinding,
      triangleCountPerInstance: Math.round(count / 3)
    };
  } catch (error) {
    mesh.destroy();
    throw error;
  }
}
