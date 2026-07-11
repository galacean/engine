/** GPU and query contracts owned by the river runtime. */
import type { ModelMesh } from "@galacean/engine-core";
import type { Vector2, Vector3 } from "@galacean/engine-math";

export interface RiverMeshBuildResult {
  surfaceMesh: ModelMesh;
  bankFoamMesh?: ModelMesh;
}

export interface RiverMeshData {
  positions: Vector3[];
  uvs: Vector2[];
  uv1s?: Vector2[];
  indices: number[];
  drawIndexCount?: number;
}

export interface RiverQueryData {
  samples: Float32Array;
  stride: number;
}

export interface RiverQueryResult {
  inWater: boolean;
  surfaceHeight: number;
  depth: number;
  flowDirection: Vector3;
  flowSpeed: number;
  distanceToBank: number;
}
