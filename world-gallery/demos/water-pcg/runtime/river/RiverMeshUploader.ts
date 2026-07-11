/** Converts compiler-owned CPU geometry into reusable Galacean ModelMesh resources. */
import { Engine, MeshTopology, ModelMesh } from "@galacean/engine-core";
import { Vector2, Vector3 } from "@galacean/engine-math";
import type { RiverGeometryData, RiverRenderableArtifact } from "../../compiler/river/types";
import type { RiverMeshBuildResult } from "./types";

export interface RiverMeshUploadOptions {
  existing?: RiverMeshBuildResult;
  releaseCpuData?: boolean;
}

function uploadGeometry(
  engine: Engine,
  geometry: RiverGeometryData,
  existing?: ModelMesh,
  releaseCpuData = false
): ModelMesh {
  const mesh = existing ?? new ModelMesh(engine);
  const positions = geometry.positions.map((value) => new Vector3(value[0], value[1], value[2]));
  const uvs = geometry.uvs.map((value) => new Vector2(value[0], value[1]));
  const uv1s = geometry.uv1s.map((value) => new Vector2(value[0], value[1]));
  const sourceIndices = geometry.indices.toTypedArray();
  const indices = positions.length > 65535 ? sourceIndices : new Uint16Array(sourceIndices);

  mesh.bounds.min.set(geometry.bounds.min[0], geometry.bounds.min[1], geometry.bounds.min[2]);
  mesh.bounds.max.set(geometry.bounds.max[0], geometry.bounds.max[1], geometry.bounds.max[2]);
  mesh.setPositions(positions);
  mesh.setUVs(uvs);
  mesh.setUVs(uv1s, 1);
  mesh.setColors(null);
  mesh.setIndices(indices);
  mesh.clearSubMesh();
  mesh.addSubMesh(geometry.drawStart, geometry.drawCount, MeshTopology.Triangles);
  mesh.uploadData(releaseCpuData);
  return mesh;
}

export function uploadRiverMeshes(
  engine: Engine,
  artifact: RiverRenderableArtifact,
  options: RiverMeshUploadOptions = {}
): RiverMeshBuildResult {
  return {
    surfaceMesh: uploadGeometry(
      engine,
      artifact.surfaceGeometry,
      options.existing?.surfaceMesh,
      options.releaseCpuData
    ),
    bankFoamMesh: artifact.bankFoamGeometry
      ? uploadGeometry(engine, artifact.bankFoamGeometry, options.existing?.bankFoamMesh, options.releaseCpuData)
      : undefined
  };
}
