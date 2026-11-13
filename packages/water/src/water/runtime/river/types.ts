/** GPU and query contracts owned by the river runtime. */
import type { ModelMesh } from "@galacean/engine-core";
import type { Vector3 } from "@galacean/engine-math";
import type { RiverChunkSourceKind } from "../../compiler/river/RiverGeometryEnums";

export interface RiverMeshBuildResult {
  surfaceMesh: ModelMesh;
}

/** Caller-owned scalar result. `sampleSurface` mutates it without allocating. */
export interface RiverNetworkQueryResult {
  hit: boolean;
  waterBodyId: string;
  segmentId: string;
  sourceKind?: RiverChunkSourceKind;
  sourceIndex: number;
  insideFootprint: boolean;
  insideVolume: boolean;
  surfaceHeight: number;
  surfaceVerticalVelocity: number;
  signedSurfaceDistance: number;
  submergedDepth: number;
  waterDepth: number;
  distanceToBank: number;
  baseFlowVector: Vector3;
  localFlowVector: Vector3;
  localFlowWeight: number;
  flowVector: Vector3;
  surfaceNormal: Vector3;
}
