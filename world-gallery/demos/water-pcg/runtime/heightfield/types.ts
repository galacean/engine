/** GPU-facing runtime contracts for heightfield water. */
import type { Material, ModelMesh } from "@galacean/engine-core";
import type { WaterQualityTier } from "../../authoring/wave/enums/WaterQualityTier";
import type { CompiledWaterWaveSet } from "../../compiler/wave/CompiledWaterWaveTypes";
import type { WaterSurfaceOpticsBinding, WaterSurfaceOpticsBindingState } from "../optics/WaterSurfaceOpticsTypes";
import type { HeightfieldWaterReflectionSamplingReadback } from "./HeightfieldWaterReflectionSampling";
import type { HeightfieldWaterOpticsCalibrationMode } from "./HeightfieldWaterRuntimeEnums";

export type MutableHeightfieldWaterSurfaceOpticsBinding = {
  -readonly [Property in keyof WaterSurfaceOpticsBinding]: WaterSurfaceOpticsBinding[Property];
};

export type HeightfieldVector2Tuple = readonly [number, number];
export type HeightfieldVector3Tuple = readonly [number, number, number];
export type HeightfieldVector4Tuple = readonly [number, number, number, number];

export interface HeightfieldWaterMeshBuildResult {
  readonly surfaceMesh: ModelMesh;
}

export interface HeightfieldWaterMaterialState extends WaterSurfaceOpticsBindingState {
  readonly material: Material;
  readonly quality: WaterQualityTier;
  readonly waveSet: CompiledWaterWaveSet;
  /** Stable compatibility input updated by both the aggregate and legacy setters. */
  readonly surfaceOpticsBinding: MutableHeightfieldWaterSurfaceOpticsBinding;
  /** Stable Heightfield-shaped readback retained for the P0 Lab metrics contract. */
  readonly heightfieldReflectionReadback: Readonly<HeightfieldWaterReflectionSamplingReadback>;
  /** Stable readback for the explicit shader calibration path. */
  readonly opticsCalibrationReadback: Readonly<HeightfieldWaterOpticsCalibrationReadback>;
}

export interface HeightfieldWaterOpticsCalibrationReadback {
  readonly mode: HeightfieldWaterOpticsCalibrationMode;
  readonly referenceCompositionEnabled: boolean;
  /** PureTransmission is the only mode that overrides the physical Fresnel term. */
  readonly effectiveFresnelOverride: 0 | undefined;
}

export interface HeightfieldWaterFeatureFlags {
  readonly waves: boolean;
  readonly microNormals: boolean;
  readonly foam: boolean;
}

/** Runtime-local rectangular foam region in world XZ; intended for authored/demo local effects. */
export interface HeightfieldWaterLocalFoamMask {
  readonly enabled: boolean;
  readonly centerXZ: HeightfieldVector2Tuple;
  readonly halfSizeXZ: HeightfieldVector2Tuple;
  readonly featherMeters: number;
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
