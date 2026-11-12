import {
  BoundingBox,
  Buffer,
  BufferBindFlag,
  BufferUsage,
  Engine,
  ModelMesh,
  VertexElement,
  VertexElementFormat
} from "@galacean/engine";
import {
  createTerrainDetailInstancedMesh,
  type TerrainDetailInstancedMesh
} from "@galacean/engine-terrain/terrain/project/TerrainDetailInstancedMesh";
const GRASS_ROCK_APPEARANCE_STRIDE = 28;

/** Seed's position/rotation, three-axis scale, substrate descriptor and supporting normal. */
export const NATIVE_GRASS_TRANSFORM_FLOATS = 13;

/** All buffers are owned; the authored Prefab's vertex buffers remain borrowed. */
export interface NativeGrassInstancedMesh extends TerrainDetailInstancedMesh {
  appearanceBuffer: Buffer;
}

/**
 * Adds Seed's native compact and rock-appearance attributes to the public Detail mesh adapter.
 * The original adapter retains responsibility for authored mesh/index handling.
 * @param engine GPU resource owner.
 * @param sourceMesh Authored grass primitive.
 * @param transforms Seed's thirteen-float per-instance records.
 * @param appearance Seven vec4 records describing each root's exact supporting triangle.
 * @param bounds Conservative world-space culling bounds.
 * @returns Owned mesh and buffers, with source vertices still borrowed.
 */
export function createNativeGrassInstancedMesh(
  engine: Engine,
  sourceMesh: ModelMesh,
  transforms: Float32Array,
  appearance: Float32Array,
  bounds: BoundingBox
): NativeGrassInstancedMesh {
  const count = transforms.length / NATIVE_GRASS_TRANSFORM_FLOATS;
  if (!Number.isInteger(count) || count <= 0 || appearance.length !== count * GRASS_ROCK_APPEARANCE_STRIDE) {
    throw new RangeError("Native rock grass requires matching compact transforms and appearance records");
  }
  const detail = new Float32Array(count * 6);
  for (let i = 0; i < count; i++) {
    const offset = i * NATIVE_GRASS_TRANSFORM_FLOATS;
    detail.set(transforms.subarray(offset, offset + 6), i * 6);
  }
  const resource = createTerrainDetailInstancedMesh(engine, sourceMesh, detail, bounds, "Native Seed rock grass");
  let instanceBuffer: Buffer | undefined, appearanceBuffer: Buffer | undefined;
  try {
    instanceBuffer = new Buffer(engine, BufferBindFlag.VertexBuffer, transforms, BufferUsage.Static);
    appearanceBuffer = new Buffer(engine, BufferBindFlag.VertexBuffer, appearance, BufferUsage.Static);
    const binding = sourceMesh.vertexBufferBindings.length;
    resource.mesh.setVertexBufferBinding(instanceBuffer, NATIVE_GRASS_TRANSFORM_FLOATS * 4, binding);
    resource.mesh.setVertexBufferBinding(appearanceBuffer, GRASS_ROCK_APPEARANCE_STRIDE * 4, binding + 1);
    // Keep the exact offsets and macro contract used by SeedWorldPopulationRuntime.
    resource.mesh.setVertexElements([
      ...sourceMesh.vertexElements,
      new VertexElement("DETAIL_POSITION_ROTATION", 0, VertexElementFormat.Vector4, binding, 1),
      new VertexElement("DETAIL_SCALE", 16, VertexElementFormat.Vector3, binding, 1),
      new VertexElement("DETAIL_SURFACE_WEIGHTS", 28, VertexElementFormat.Vector3, binding, 1),
      new VertexElement("DETAIL_TERRAIN_NORMAL", 40, VertexElementFormat.Vector3, binding, 1),
      ...["A", "B", "C", "NA", "NB", "NC", "META"].map(
        (suffix, i) => new VertexElement(`DETAIL_ROCK_${suffix}`, i * 16, VertexElementFormat.Vector4, binding + 1, 1)
      )
    ]);
    resource.instanceBuffer.destroy();
    return { mesh: resource.mesh, indexBuffer: resource.indexBuffer, instanceBuffer, appearanceBuffer };
  } catch (error) {
    resource.mesh.destroy();
    resource.instanceBuffer.destroy();
    resource.indexBuffer?.destroy();
    instanceBuffer?.destroy();
    appearanceBuffer?.destroy();
    throw error;
  }
}
