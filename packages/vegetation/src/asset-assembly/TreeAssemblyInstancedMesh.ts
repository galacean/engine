import {
  BoundingBox,
  Buffer,
  BufferBindFlag,
  BufferMesh,
  BufferUsage,
  Engine,
  IndexBufferBinding,
  ModelMesh,
  SetDataOptions,
  VertexElement,
  VertexElementFormat
} from "@galacean/engine";

/** Float count in the common position/fade, quaternion, scale/density, and color/LOD record. */
export const TREE_ASSEMBLY_INSTANCE_FLOATS = 16;
/** Position/LOD, quaternion, and scale-only record used when color is shared by the Material. */
export const TREE_ASSEMBLY_COMPACT_INSTANCE_FLOATS = 12;
/** Compact transform followed by per-instance authoring reveal membership, origin, and height. */
export const TREE_ASSEMBLY_COMPACT_REVEAL_INSTANCE_FLOATS = TREE_ASSEMBLY_COMPACT_INSTANCE_FLOATS + 3;
/** Optional vec4 pairs for GPU tree shape controls and arbitrary per-instance leaf color. */
export const TREE_ASSEMBLY_GPU_VARIATION_INSTANCE_FLOATS = TREE_ASSEMBLY_INSTANCE_FLOATS + 8;
/** The compact position record's W lane is owned exclusively by signed LOD dither coverage. */
export const TREE_ASSEMBLY_COMPACT_LOD_FADE_FLOAT_OFFSET = 3;
/** The common color record's W lane is owned exclusively by signed LOD dither coverage. */
export const TREE_ASSEMBLY_LOD_FADE_FLOAT_OFFSET = TREE_ASSEMBLY_INSTANCE_FLOATS - 1;
/** GPU leaves duplicate signed coverage in an already-active attribute to stay within the vertex-input budget. */
export const TREE_ASSEMBLY_GPU_VARIATION_LEAF_LOD_FADE_FLOAT_OFFSET = TREE_ASSEMBLY_GPU_VARIATION_INSTANCE_FLOATS - 1;

/** GPU mesh view and reusable instance storage for one shared modular-tree unit. */
export interface TreeAssemblyInstancedMesh {
  /** Mesh view combining shared unit geometry and the owned instance binding. */
  readonly mesh: BufferMesh;
  /** Dynamic GPU storage rewritten with the visible prefix. */
  readonly instanceBuffer: Buffer;
  /** Fixed-capacity CPU staging storage. */
  readonly staging: Float32Array;
  readonly recordFloats: number;
}

/** One transform/color record set that may be bound to several material passes of the same instances. */
export interface TreeAssemblyInstanceStorage {
  readonly instanceBuffer: Buffer;
  readonly staging: Float32Array;
  readonly capacity: number;
  readonly recordFloats: number;
}

/** Allocates one reusable instance record set independently from any source primitive. */
export function createTreeAssemblyInstanceStorage(
  engine: Engine,
  capacity: number,
  recordFloats: number = TREE_ASSEMBLY_INSTANCE_FLOATS
): TreeAssemblyInstanceStorage {
  if (!Number.isInteger(capacity) || capacity <= 0) throw new RangeError("Tree Assembly capacity must be positive");
  if (
    recordFloats !== TREE_ASSEMBLY_COMPACT_INSTANCE_FLOATS &&
    recordFloats !== TREE_ASSEMBLY_COMPACT_REVEAL_INSTANCE_FLOATS &&
    recordFloats !== TREE_ASSEMBLY_INSTANCE_FLOATS &&
    recordFloats !== TREE_ASSEMBLY_GPU_VARIATION_INSTANCE_FLOATS
  ) {
    throw new RangeError(
      "Tree Assembly instance records must use the compact, compact-reveal, common, or GPU-tree-variation layout"
    );
  }
  const staging = new Float32Array(capacity * recordFloats);
  return {
    instanceBuffer: new Buffer(engine, BufferBindFlag.VertexBuffer, staging.byteLength, BufferUsage.Dynamic),
    staging,
    capacity,
    recordFloats
  };
}

/**
 * Creates a dynamic instanced view over one shared modular-tree unit.
 * @param engine Engine owning the view.
 * @param sourceMesh Shared authored trunk or foliage mesh.
 * @param capacity Maximum records uploaded in one frame.
 * @param bounds Conservative world bounds covering every generated tree.
 * @param name Stable diagnostics name.
 * @returns Runtime-owned instanced view and reusable staging memory.
 */
export function createTreeAssemblyInstancedMesh(
  engine: Engine,
  sourceMesh: ModelMesh,
  capacity: number,
  bounds: BoundingBox,
  name: string,
  sharedStorage?: TreeAssemblyInstanceStorage
): TreeAssemblyInstancedMesh {
  if (!Number.isInteger(capacity) || capacity <= 0) throw new RangeError("Tree Assembly capacity must be positive");
  if (sourceMesh.blendShapeCount !== 0 || sourceMesh.subMeshes.length !== 1) {
    throw new Error("Tree Assembly instancing requires one non-skinned static primitive");
  }
  const sourceIndexBinding = (sourceMesh as unknown as ModelMeshPrimitiveInternals)._primitive.indexBufferBinding;
  if (sharedStorage && sharedStorage.capacity !== capacity) {
    throw new RangeError("Shared Tree Assembly instance storage capacity does not match the mesh view");
  }
  const ownsStorage = !sharedStorage;
  const storage = sharedStorage ?? createTreeAssemblyInstanceStorage(engine, capacity);
  const { staging, instanceBuffer } = storage;
  const mesh = new BufferMesh(engine, name);
  try {
    sourceMesh.vertexBufferBindings.forEach((binding, index) => {
      if (binding) mesh.setVertexBufferBinding(binding, index);
    });
    const instanceBinding = sourceMesh.vertexBufferBindings.length;
    mesh.setVertexBufferBinding(instanceBuffer, storage.recordFloats * Float32Array.BYTES_PER_ELEMENT, instanceBinding);
    const instanceElements = [
      ...sourceMesh.vertexElements,
      new VertexElement("ASSEMBLY_POSITION", 0, VertexElementFormat.Vector4, instanceBinding, 1),
      new VertexElement("ASSEMBLY_ROTATION", 16, VertexElementFormat.Vector4, instanceBinding, 1),
      new VertexElement("ASSEMBLY_SCALE", 32, VertexElementFormat.Vector4, instanceBinding, 1)
    ];
    if (storage.recordFloats === TREE_ASSEMBLY_COMPACT_REVEAL_INSTANCE_FLOATS) {
      instanceElements.push(
        new VertexElement("GENERATION_REVEAL", 48, VertexElementFormat.Vector3, instanceBinding, 1)
      );
    } else if (storage.recordFloats !== TREE_ASSEMBLY_COMPACT_INSTANCE_FLOATS) {
      instanceElements.push(new VertexElement("ASSEMBLY_COLOR", 48, VertexElementFormat.Vector4, instanceBinding, 1));
    }
    if (storage.recordFloats === TREE_ASSEMBLY_GPU_VARIATION_INSTANCE_FLOATS) {
      instanceElements.push(
        new VertexElement("ASSEMBLY_TREE_VARIATION", 64, VertexElementFormat.Vector4, instanceBinding, 1),
        new VertexElement("ASSEMBLY_TREE_LEAF_COLOR", 80, VertexElementFormat.Vector4, instanceBinding, 1)
      );
    }
    mesh.setVertexElements(instanceElements);
    if (sourceIndexBinding) mesh.setIndexBufferBinding(sourceIndexBinding);
    const subMesh = sourceMesh.subMeshes[0];
    mesh.addSubMesh(subMesh.start, subMesh.count, subMesh.topology);
    mesh.bounds = bounds;
    mesh.instanceCount = 0;
    return { mesh, instanceBuffer, staging, recordFloats: storage.recordFloats };
  } catch (error) {
    mesh.destroy();
    if (ownsStorage) instanceBuffer.destroy(true);
    throw error;
  }
}

/**
 * Uploads the active prefix without reallocating either CPU or GPU storage.
 * @param resources Batch-owned dynamic storage.
 * @param count Number of complete records to submit.
 * @returns Nothing.
 */
export function uploadTreeAssemblyInstances(resources: TreeAssemblyInstancedMesh, count: number): void {
  if (!Number.isInteger(count) || count < 0 || count * resources.recordFloats > resources.staging.length) {
    throw new RangeError("Tree Assembly upload exceeds its batch capacity");
  }
  if (count > 0) {
    resources.instanceBuffer.setData(resources.staging, 0, 0, count * resources.recordFloats, SetDataOptions.Discard);
  }
  resources.mesh.instanceCount = count;
}

/** Uploads one edited instance record without rewriting the other records sharing this storage. */
export function uploadTreeAssemblyInstance(storage: TreeAssemblyInstanceStorage, index: number): void {
  if (!Number.isInteger(index) || index < 0 || index >= storage.capacity) {
    throw new RangeError("Tree Assembly instance index is outside its storage capacity");
  }
  const dataOffset = index * storage.recordFloats;
  storage.instanceBuffer.setData(
    storage.staging,
    dataOffset * Float32Array.BYTES_PER_ELEMENT,
    dataOffset,
    storage.recordFloats,
    SetDataOptions.None
  );
}

interface ModelMeshPrimitiveInternals {
  readonly _primitive: {
    readonly indexBufferBinding: IndexBufferBinding | null;
  };
}
