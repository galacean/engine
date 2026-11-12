/** GPU-facing runtime contracts for heightfield water. */
import type { Buffer, Material, ModelMesh } from "@galacean/engine-core";
import type { WaterSurfaceDepthSource } from "../../authoring/surface/enums/WaterSurfaceDepthSource";
import type { WaterQualityTier } from "../../authoring/wave/enums/WaterQualityTier";
import type { CompiledWaterWaveSet } from "../../compiler/wave/CompiledWaterWaveTypes";
import type { WaterSurfaceOpticsBinding, WaterSurfaceOpticsBindingState } from "../optics/WaterSurfaceOpticsTypes";
import type { WaterSurfaceAppearanceBindingReadback } from "../surface/WaterSurfaceAppearanceRuntimeTypes";

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

  /** Stable readback mutated in place as appearance bindings are applied or detached. */
  readonly surfaceAppearanceReadback: Readonly<WaterSurfaceAppearanceBindingReadback>;
  /** Stable requested A/B gates retained independently from binding capability readback. */
  readonly surfaceAppearanceFeatureFlags: MutableHeightfieldWaterSurfaceAppearanceFeatureFlags;
}

export interface HeightfieldWaterFeatureFlags {
  readonly waves: boolean;
  readonly microNormals: boolean;
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

export interface HeightfieldWaterBaseQueryResult {
  inside: boolean;
  componentIndex: number;
  surfaceHeight: number;
  surfaceNormal: [number, number, number];
  depth: number;
  signedShoreDistance: number;
  flowVectorXZ: [number, number];
}
