/** GPU-facing runtime contracts for heightfield water. */
import type { Buffer, Material, ModelMesh } from "@galacean/engine-core";
import type { WaterQualityTier } from "../../authoring/wave/enums/WaterQualityTier";
import type { WaterSurfaceDepthSource } from "../../authoring/surface/enums/WaterSurfaceDepthSource";
import type { CompiledWaterWaveSet } from "../../compiler/wave/CompiledWaterWaveTypes";
import type { WaterSurfaceOpticsBinding, WaterSurfaceOpticsBindingState } from "../optics/WaterSurfaceOpticsTypes";
import type { WaterSurfaceAppearanceBindingReadback } from "../surface/WaterSurfaceAppearanceRuntimeTypes";
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
  /** Buffers allocated by this mesh upload and destroyed with the runtime set. */
  readonly ownedBuffers: readonly Buffer[];
}

export interface HeightfieldWaterMaterialState extends WaterSurfaceOpticsBindingState {
  readonly material: Material;
  /** Explicit shader-variant depth source; never inferred from camera state. */
  readonly depthSource: WaterSurfaceDepthSource;
  readonly quality: WaterQualityTier;
  readonly waveSet: CompiledWaterWaveSet;
  /** Stable aggregate binding updated only through the canonical Surface Optics contract. */
  readonly surfaceOpticsBinding: MutableHeightfieldWaterSurfaceOpticsBinding;
  /** Stable Heightfield-shaped readback retained for the P0 Lab metrics contract. */
  readonly heightfieldReflectionReadback: Readonly<HeightfieldWaterReflectionSamplingReadback>;
  /** Stable Water Forward SSR-consumption diagnostics; independent from the Camera SSR lease and Surface pass. */
  readonly screenSpaceReflectionConsumptionReadback: Readonly<HeightfieldWaterScreenSpaceReflectionConsumptionReadback>;
  /** Stable readback for the explicit shader calibration path. */
  readonly opticsCalibrationReadback: Readonly<HeightfieldWaterOpticsCalibrationReadback>;
  /** Stable readback mutated in place as appearance bindings are applied or detached. */
  readonly surfaceAppearanceReadback: Readonly<WaterSurfaceAppearanceBindingReadback>;
  /** Stable requested A/B gates retained independently from binding capability readback. */
  readonly surfaceAppearanceFeatureFlags: MutableHeightfieldWaterSurfaceAppearanceFeatureFlags;
}

export interface HeightfieldWaterScreenSpaceReflectionConsumptionReadback {
  /** Whether a non-zero Water Forward SSR composite was requested. */
  readonly requested: boolean;
  /** Whether the active reflection binding is SSR and Water Forward applies a non-zero composite. */
  readonly effective: boolean;
  /** Sanitized Water Forward composite intensity in the normalized [0, 1] range. */
  readonly requestedIntensity: number;
  /** Shader-effective intensity after reflection-source resolution. */
  readonly effectiveIntensity: number;
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

export interface HeightfieldWaterSurfaceAppearanceFeatureFlags {
  readonly externalNormal: boolean;
  readonly depthTint: boolean;
  readonly coastalAlpha: boolean;
  readonly contactFoam: boolean;
  readonly directSpecular: boolean;
}

export type MutableHeightfieldWaterSurfaceAppearanceFeatureFlags = {
  -readonly [Property in keyof HeightfieldWaterSurfaceAppearanceFeatureFlags]: HeightfieldWaterSurfaceAppearanceFeatureFlags[Property];
};

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
