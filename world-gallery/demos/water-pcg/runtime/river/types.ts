/** GPU and query contracts owned by the river runtime. */
import type { ModelMesh } from "@galacean/engine-core";
import type { Vector3 } from "@galacean/engine-math";

export interface RiverMeshBuildResult {
  surfaceMesh: ModelMesh;
  bankFoamMesh?: ModelMesh;
}

export interface RiverQueryResult {
  inWater: boolean;
  surfaceHeight: number;
  depth: number;
  flowDirection: Vector3;
  flowSpeed: number;
  distanceToBank: number;
}
