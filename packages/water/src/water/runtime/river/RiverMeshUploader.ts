import { destroyWaterOwnedMesh } from "../resources/destroyWaterOwnedMesh";
/** Converts compiler-owned CPU geometry into reusable Galacean ModelMesh resources. */
import { type Buffer, ContentRestorer, Engine, MeshTopology, ModelMesh, VertexAttribute } from "@galacean/engine-core";
import { Color, Vector2, Vector3, Vector4 } from "@galacean/engine-math";
import type { RiverGeometryData, RiverRenderableArtifact } from "../../compiler/river/types";
import type { RiverMeshBuildResult } from "./types";

export interface RiverMeshUploadOptions {
  existing?: RiverMeshBuildResult;
  releaseCpuData?: boolean;
}

function motionGradient(geometry: RiverGeometryData, index: number): readonly number[] {
  if (geometry.motionGradients) return geometry.motionGradients[index];
  const tangent = geometry.tangents?.[index] ?? [0, 0, 1, 1];
  const length = Math.hypot(tangent[0], tangent[2]) || 1;
  return [-tangent[2] / length, tangent[0] / length, tangent[0] / length, tangent[2] / length];
}

/** Keeps only the immutable compiler recipe; packed vertex data lives for one restore call. */
class RiverMeshContentRestorer extends ContentRestorer<ModelMesh> {
  constructor(
    mesh: ModelMesh,
    private readonly geometry: RiverGeometryData
  ) {
    super(mesh);
  }

  restoreContent(): void {
    const mesh = this.resource;
    const geometry = this.geometry;
    const elements = mesh.vertexElements;
    for (const [bindingIndex, binding] of mesh.vertexBufferBindings.entries()) {
      if (!binding) continue;
      const packed = new Float32Array(binding.buffer.byteLength / Float32Array.BYTES_PER_ELEMENT);
      for (const element of elements) {
        if (element.bindingIndex !== bindingIndex) continue;
        let values: readonly (readonly number[])[] | undefined;
        let componentStart = 0;
        let componentCount: number;
        switch (element.attribute) {
          case VertexAttribute.Position:
            values = geometry.positions;
            componentCount = 3;
            break;
          case VertexAttribute.Normal:
            values = geometry.normals;
            componentCount = 3;
            break;
          case VertexAttribute.Tangent:
            values = geometry.tangents;
            componentCount = 4;
            break;
          case VertexAttribute.Color:
            values = geometry.colors;
            componentCount = 4;
            break;
          case VertexAttribute.UV:
            values = geometry.uvs;
            componentCount = 2;
            break;
          case VertexAttribute.UV1:
            values = geometry.uv1s;
            componentCount = 2;
            break;
          case VertexAttribute.UV2:
            values = geometry.uv2s;
            componentCount = 2;
            break;
          case VertexAttribute.UV3:
            values = geometry.uv3s;
            componentCount = 2;
            break;
          case VertexAttribute.UV4:
            values = geometry.motionGradients;
            componentCount = 2;
            break;
          case VertexAttribute.UV5:
            values = geometry.motionGradients;
            componentStart = 2;
            componentCount = 2;
            break;
          default:
            throw new Error(`Unexpected River mesh attribute: ${element.attribute}`);
        }
        for (let index = 0; index < geometry.positions.length; index++) {
          const source = values ? values[index] : motionGradient(geometry, index);
          const offset = (index * binding.stride + element.offset) / Float32Array.BYTES_PER_ELEMENT;
          for (let component = 0; component < componentCount; component++) {
            packed[offset + component] = source[componentStart + component];
          }
        }
      }
      // setData remains valid after uploadData(true) has released the advanced vertex cache.
      binding.buffer.setData(packed);
    }
    // The engine declaration bundle hides this internal index-buffer accessor.
    const primitive = (mesh as ModelMesh & { _primitive: { indexBufferBinding: { _buffer: Buffer } } })._primitive;
    const indices = geometry.indices.borrowTypedArray();
    primitive.indexBufferBinding._buffer.setData(
      geometry.positions.length > 65535 ? indices : new Uint16Array(indices)
    );
  }
}

function uploadGeometry(
  engine: Engine,
  geometry: RiverGeometryData,
  existing?: ModelMesh,
  releaseCpuData = false
): ModelMesh {
  const mesh = existing ?? new ModelMesh(engine);
  try {
    const positions = geometry.positions.map((value) => new Vector3(value[0], value[1], value[2]));
    const uvs = geometry.uvs.map((value) => new Vector2(value[0], value[1]));
    const uv1s = geometry.uv1s.map((value) => new Vector2(value[0], value[1]));
    const uv2s = geometry.uv2s?.map((value) => new Vector2(value[0], value[1])) ?? null;
    const uv3s = geometry.uv3s?.map((value) => new Vector2(value[0], value[1])) ?? null;
    const sourceIndices = geometry.indices.borrowTypedArray();
    const indices = positions.length > 65535 ? sourceIndices : new Uint16Array(sourceIndices);

    mesh.bounds.min.set(geometry.bounds.min[0], geometry.bounds.min[1], geometry.bounds.min[2]);
    mesh.bounds.max.set(geometry.bounds.max[0], geometry.bounds.max[1], geometry.bounds.max[2]);
    mesh.setPositions(positions);
    mesh.setNormals(
      geometry.normals ? geometry.normals.map((value) => new Vector3(value[0], value[1], value[2])) : null
    );
    mesh.setTangents(
      geometry.tangents ? geometry.tangents.map((value) => new Vector4(value[0], value[1], value[2], value[3])) : null
    );
    mesh.setUVs(uvs);
    mesh.setUVs(uv1s, 1);
    mesh.setUVs(uv2s, 2);
    mesh.setUVs(uv3s, 3);
    const motionGradients = geometry.positions.map((_, index) => motionGradient(geometry, index));
    mesh.setUVs(
      motionGradients.map((g) => new Vector2(g[0], g[1])),
      4
    );
    mesh.setUVs(
      motionGradients.map((g) => new Vector2(g[2], g[3])),
      5
    );
    mesh.setColors(
      geometry.colors ? geometry.colors.map((value) => new Color(value[0], value[1], value[2], value[3])) : null
    );
    mesh.setIndices(indices);
    mesh.clearSubMesh();
    mesh.addSubMesh(geometry.drawStart, geometry.drawCount, MeshTopology.Triangles);
    mesh.uploadData(releaseCpuData);
    engine.resourceManager.addContentRestorer(new RiverMeshContentRestorer(mesh, geometry));
    return mesh;
  } catch (error) {
    if (!existing) destroyWaterOwnedMesh(mesh);
    throw error;
  }
}

export function uploadRiverMeshes(
  engine: Engine,
  artifact: RiverRenderableArtifact,
  options: RiverMeshUploadOptions = {}
): RiverMeshBuildResult {
  const surfaceMesh = uploadGeometry(
    engine,
    artifact.surfaceGeometry,
    options.existing?.surfaceMesh,
    options.releaseCpuData
  );
  return { surfaceMesh };
}
