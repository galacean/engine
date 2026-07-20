/** GPU-facing runtime contracts for heightfield water. */
import type { Material, ModelMesh } from "@galacean/engine-core";
import type { WaterQualityTier } from "../../authoring/wave/enums/WaterQualityTier";
import type { CompiledWaterWaveSet } from "../../compiler/wave/CompiledWaterWaveTypes";

export type HeightfieldVector2Tuple = readonly [number, number];
export type HeightfieldVector3Tuple = readonly [number, number, number];
export type HeightfieldVector4Tuple = readonly [number, number, number, number];

export interface HeightfieldWaterMeshBuildResult {
  readonly surfaceMesh: ModelMesh;
}

export interface HeightfieldWaterMaterialState {
  readonly material: Material;
  readonly quality: WaterQualityTier;
  readonly waveSet: CompiledWaterWaveSet;
}

export interface HeightfieldWaterFeatureFlags {
  readonly waves: boolean;
  readonly microNormals: boolean;
  readonly foam: boolean;
}

export interface HeightfieldWaterBaseQueryResult {
  inside: boolean;
  componentIndex: number;
  surfaceHeight: number;
  surfaceNormal: [number, number, number];
  depth: number;
  signedShoreDistance: number;
  flowVectorXZ: [number, number];
}
