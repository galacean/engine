import {
  type BoundingBox,
  Buffer,
  BufferBindFlag,
  BufferMesh,
  BufferUsage,
  type Engine,
  type IndexBufferBinding,
  type ModelMesh,
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

/** GPU mesh view that shares the authored vertex and index buffers. */
export interface SeedWorldDetailInstancedMesh {
  readonly mesh: BufferMesh;
  instanceBuffer: Buffer;
  readonly instanceBinding: number;
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
  name: string
): SeedWorldDetailInstancedMesh {
  if (sourceMesh.blendShapeCount !== 0 || sourceMesh.subMeshes.length !== 1 || sourceMesh.subMeshes[0].count <= 0) {
    throw new Error("Seed World compact Detail instancing requires one non-skinned static primitive");
  }
  const transformFloatCount = instanceCount * DETAIL_TRANSFORM_FLOATS;
  if (!Number.isInteger(instanceCount) || instanceCount <= 0 || transformFloatCount > transforms.length) {
    throw new RangeError("Seed World compact Detail instance count exceeds transform storage");
  }
  const sourceIndexBinding = (sourceMesh as unknown as ModelMeshPrimitiveInternals)._primitive.indexBufferBinding;
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
    if (sourceIndexBinding) mesh.setIndexBufferBinding(sourceIndexBinding);
    const subMesh = sourceMesh.subMeshes[0];
    mesh.addSubMesh(subMesh.start, subMesh.count, subMesh.topology);
    mesh.bounds = bounds;
    mesh.instanceCount = instanceCount;
    return { mesh, instanceBuffer, instanceBinding };
  } catch (error) {
    mesh.destroy();
    instanceBuffer.destroy(true);
    throw error;
  }
}
