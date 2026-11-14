import {
  BoundingBox,
  Buffer,
  BufferBindFlag,
  BufferMesh,
  BufferUsage,
  Engine,
  IndexBufferBinding,
  IndexFormat,
  ModelMesh,
  VertexElement,
  VertexElementFormat
} from "@galacean/engine";

const BILLBOARD_TRANSFORM_FLOATS = 6;
const BILLBOARD_TRANSFORM_STRIDE_BYTES = BILLBOARD_TRANSFORM_FLOATS * Float32Array.BYTES_PER_ELEMENT;

/** GPU resources owned by one canonical Billboard renderer batch. */
export interface TerrainBillboardInstancedMesh {
  /** Mesh view sharing source vertices and owning the Billboard instance binding. */
  readonly mesh: BufferMesh;
  /** Immutable interleaved origin and scale records. */
  readonly instanceBuffer: Buffer;
  /** Optional copied index buffer required by indexed source geometry. */
  readonly indexBuffer: Buffer | null;
}

/**
 * Creates one static cylindrical Billboard instance mesh from exact Prefab renderer transforms.
 * @param engine Engine that owns the GPU resources.
 * @param sourceMesh Source primitive resolved from the declared Prefab renderer.
 * @param transforms Six-float records containing Prefab-root-local origin XYZ and model scale XYZ.
 * @param bounds Conservative local bounds containing every instance.
 * @param name Stable diagnostic name for the runtime-owned mesh.
 * @returns Runtime-owned mesh and buffers; callers must release them together.
 * @throws If transforms are empty or malformed, or indexed source data was not retained by its loader.
 */
export function createTerrainBillboardInstancedMesh(
  engine: Engine,
  sourceMesh: ModelMesh,
  transforms: Float32Array,
  bounds: BoundingBox,
  name: string
): TerrainBillboardInstancedMesh {
  if (!transforms.length || transforms.length % BILLBOARD_TRANSFORM_FLOATS !== 0) {
    throw new Error("Billboard instance transforms must contain complete nonempty six-float records");
  }

  const instanceBuffer = new Buffer(engine, BufferBindFlag.VertexBuffer, transforms, BufferUsage.Static);
  const mesh = new BufferMesh(engine, name);
  let indexBuffer: Buffer | null = null;
  try {
    sourceMesh.vertexBufferBindings.forEach((binding, index) => {
      if (binding) mesh.setVertexBufferBinding(binding, index);
    });
    const instanceBinding = sourceMesh.vertexBufferBindings.length;
    mesh.setVertexBufferBinding(instanceBuffer, BILLBOARD_TRANSFORM_STRIDE_BYTES, instanceBinding);
    mesh.setVertexElements([
      ...sourceMesh.vertexElements,
      new VertexElement("BILLBOARD_ORIGIN_SCALE_X", 0, VertexElementFormat.Vector4, instanceBinding, 1),
      new VertexElement("BILLBOARD_SCALE_YZ", 16, VertexElementFormat.Vector2, instanceBinding, 1)
    ]);

    if (sourceMesh.subMeshes.some((subMesh) => subMesh.count > 0)) {
      const indices = sourceMesh.getIndices();
      if (indices) {
        indexBuffer = new Buffer(engine, BufferBindFlag.IndexBuffer, indices, BufferUsage.Static);
        mesh.setIndexBufferBinding(new IndexBufferBinding(indexBuffer, indexFormat(indices)));
      }
    }
    for (const subMesh of sourceMesh.subMeshes) mesh.addSubMesh(subMesh.start, subMesh.count, subMesh.topology);
    mesh.bounds = bounds;
    mesh.instanceCount = transforms.length / BILLBOARD_TRANSFORM_FLOATS;
    return { mesh, instanceBuffer, indexBuffer };
  } catch (error) {
    mesh.destroy(true);
    instanceBuffer.destroy(true);
    indexBuffer?.destroy(true);
    throw error;
  }
}

function indexFormat(indices: Uint8Array | Uint16Array | Uint32Array): IndexFormat {
  if (indices instanceof Uint8Array) return IndexFormat.UInt8;
  if (indices instanceof Uint16Array) return IndexFormat.UInt16;
  return IndexFormat.UInt32;
}
