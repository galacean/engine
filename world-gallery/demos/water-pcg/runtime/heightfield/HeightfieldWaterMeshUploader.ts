/** Converts compiler-owned heightfield geometry into a 16-bit-safe Galacean mesh. */
import { Engine, MeshTopology, ModelMesh } from "@galacean/engine-core";
import { Vector2, Vector3, Vector4 } from "@galacean/engine-math";
import type { HeightfieldWaterGeometryData } from "../../compiler/heightfield/HeightfieldWaterCompiledTypes";
import type { HeightfieldWaterMeshBuildResult } from "./types";

export interface HeightfieldWaterMeshUploadOptions {
  readonly existing?: HeightfieldWaterMeshBuildResult;
  readonly releaseCpuData?: boolean;
  readonly boundsPadding?: number;
}

export function uploadHeightfieldWaterMesh(
  engine: Engine,
  geometry: HeightfieldWaterGeometryData,
  options: HeightfieldWaterMeshUploadOptions = {}
): HeightfieldWaterMeshBuildResult {
  if (geometry.vertexCount > 65535) {
    throw new Error(`Heightfield water chunk has ${geometry.vertexCount} vertices; Uint16 limit is 65535.`);
  }
  if (geometry.positions.length !== geometry.vertexCount * 3) {
    throw new Error("Heightfield water geometry position buffer does not match vertexCount.");
  }
  if (geometry.normals.length !== geometry.vertexCount * 3) {
    throw new Error("Heightfield water geometry must provide one base normal per vertex.");
  }
  if (geometry.tangents.length !== geometry.vertexCount * 4) {
    throw new Error("Heightfield water geometry must provide one base tangent per vertex.");
  }
  if (geometry.uvs.length !== geometry.vertexCount * 2) {
    throw new Error("Heightfield water geometry must provide one local-map UV per vertex.");
  }

  const sourceIndices = geometry.indices.toTypedArray();
  for (const index of sourceIndices) {
    if (index >= geometry.vertexCount) {
      throw new Error(`Heightfield water geometry index ${index} is outside the vertex buffer.`);
    }
  }

  const mesh = options.existing?.surfaceMesh ?? new ModelMesh(engine);
  const boundsPadding = Math.max(0, options.boundsPadding ?? 0);
  mesh.bounds.min.set(
    geometry.bounds.min[0] - boundsPadding,
    geometry.bounds.min[1] - boundsPadding,
    geometry.bounds.min[2] - boundsPadding
  );
  mesh.bounds.max.set(
    geometry.bounds.max[0] + boundsPadding,
    geometry.bounds.max[1] + boundsPadding,
    geometry.bounds.max[2] + boundsPadding
  );
  const positions = geometry.positions.toTypedArray();
  const normals = geometry.normals.toTypedArray();
  const tangents = geometry.tangents.toTypedArray();
  const uvs = geometry.uvs.toTypedArray();
  mesh.setPositions(
    Array.from({ length: geometry.vertexCount }, (_, index) => {
      const offset = index * 3;
      return new Vector3(positions[offset], positions[offset + 1], positions[offset + 2]);
    })
  );
  mesh.setNormals(
    Array.from({ length: geometry.vertexCount }, (_, index) => {
      const offset = index * 3;
      return new Vector3(normals[offset], normals[offset + 1], normals[offset + 2]);
    })
  );
  mesh.setTangents(
    Array.from({ length: geometry.vertexCount }, (_, index) => {
      const offset = index * 4;
      return new Vector4(tangents[offset], tangents[offset + 1], tangents[offset + 2], tangents[offset + 3]);
    })
  );
  mesh.setUVs(
    Array.from({ length: geometry.vertexCount }, (_, index) => {
      const offset = index * 2;
      return new Vector2(uvs[offset], uvs[offset + 1]);
    })
  );
  mesh.setIndices(sourceIndices);
  mesh.clearSubMesh();
  mesh.addSubMesh(0, geometry.indexCount, MeshTopology.Triangles);
  mesh.uploadData(options.releaseCpuData ?? false);
  return { surfaceMesh: mesh };
}
