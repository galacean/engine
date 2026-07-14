/** GPU and query contracts owned by the river runtime. */
import type { ModelMesh } from "@galacean/engine-core";
import type { Vector3 } from "@galacean/engine-math";
import type { RiverChunkSourceKind } from "../../compiler/river/RiverGeometryEnums";

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
  flowVector: Vector3;
  surfaceNormal: Vector3;
}

/** Caller-owned structure-of-arrays output for allocation-free batch queries. */
export interface RiverNetworkQueryBatchOutput {
  readonly hits: Uint8Array;
  readonly sourceKinds: Uint8Array;
  readonly sourceIndices: Int32Array;
  readonly insideFootprints: Uint8Array;
  readonly insideVolumes: Uint8Array;
  readonly surfaceHeights: Float32Array;
  readonly surfaceVerticalVelocities: Float32Array;
  readonly signedSurfaceDistances: Float32Array;
  readonly submergedDepths: Float32Array;
  readonly waterDepths: Float32Array;
  readonly distancesToBank: Float32Array;
  readonly flowVectors: Float32Array;
  readonly surfaceNormals: Float32Array;
}
