import type { WaterSurfaceFieldGraphReadback } from "./WaterSurfaceFieldResolver";
import type { Texture2D } from "@galacean/engine-core";
import type { WaterFieldSemantic } from "../../authoring/surface/WaterSurfaceFieldTypes";
import type {
  WaterRefractionValidationModeV2,
  WaterSurfaceAppearanceSchemaVersion,
  WaterSurfaceCompositionV2,
  WaterSurfaceDepthResponseModelV2,
  WaterSurfacePrimaryColorClosure
} from "../../authoring/surface/WaterSurfaceAppearanceTypes";
import type { CompiledWaterSurfaceAppearanceV2 } from "../../compiler/surface/CompiledWaterSurfaceAppearanceTypes";
import type { CompiledWaterRenderContractV1 } from "../../compiler/surface/CompiledWaterRenderContractTypes";

export interface WaterSurfaceAppearanceTextureBindingV2 {
  readonly layerId: string;
  readonly assetId: string;
  readonly contentHash: string;
  readonly texture: Texture2D;
  readonly ownership: "borrowed";
}

export interface WaterSurfaceAppearanceBindingV2 {
  /** Authoritative runtime provider selection, including neutral/disabled consumers. */
  readonly fieldGraph?: WaterSurfaceFieldGraphReadback;
  readonly featureFlags?: { readonly directSpecular?: boolean };
  readonly appearance: CompiledWaterSurfaceAppearanceV2;
  /** Present when the binding came from a fully resolved Look. */
  readonly renderContract?: CompiledWaterRenderContractV1;
  /** Exact per-layer bindings. Two layers may deliberately borrow one texture. */
  readonly textureBindings: readonly WaterSurfaceAppearanceTextureBindingV2[];
}

export type WaterSurfaceAppearanceFallbackReason =
  | "surface-appearance-quality-unsupported"
  | "surface-appearance-compiled-data-unavailable"
  | "surface-appearance-normal-model-unsupported"
  | "surface-appearance-asset-id-mismatch"
  | "surface-appearance-content-hash-mismatch"
  | "surface-appearance-texture-unavailable"
  | "surface-appearance-ownership-invalid"
  | "surface-appearance-detail-layer-budget-exceeded"
  | "surface-appearance-pattern-octave-budget-exceeded"
  | "surface-appearance-texture-binding-missing"
  | "surface-appearance-texture-binding-unexpected"
  | "surface-appearance-refraction-depth-unavailable"
  | "surface-appearance-required-field-unavailable";

export interface WaterSurfaceAppearanceBindingReadback {
  readonly requested: boolean;
  readonly active: boolean;
  readonly appearanceAssetId?: string;
  readonly appearanceHash?: string;
  readonly variantKey?: string;
  readonly normalAssetId?: string;
  readonly normalContentHash?: string;
  readonly normalTextureWidth: number;
  readonly normalTextureHeight: number;
  readonly normalLayerCount: 0 | 1 | 2;
  readonly ownership?: "borrowed";
  readonly fallbackReason?: WaterSurfaceAppearanceFallbackReason;
  /** Structural readback for the live V2 closure. */
  readonly schemaVersion?: WaterSurfaceAppearanceSchemaVersion;
  readonly detailLayerIds?: readonly string[];
  readonly detailTextureBindingCount?: number;
  readonly primaryColorClosure?: WaterSurfacePrimaryColorClosure;
  readonly depthResponseModelV2?: WaterSurfaceDepthResponseModelV2;
  /** Canonical field set consumed by the depth response, in authored term order. */
  readonly depthResponseFields?: readonly WaterFieldSemantic[];
  /** Convenience single-field readback; absent for composite responses. */
  readonly depthResponseField?: WaterFieldSemantic;
  readonly boundaryEffectIds?: readonly string[];
  readonly refractionEnabledV2?: boolean;
  readonly refractionValidation?: WaterRefractionValidationModeV2;
  readonly occlusionValidation?: "available" | "unavailable" | "not-requested";
  readonly compositionV2?: WaterSurfaceCompositionV2;
}

export interface WaterSurfaceAppearanceBindingResolution {
  readonly binding?: Readonly<WaterSurfaceAppearanceBindingV2>;
  readonly readback: Readonly<WaterSurfaceAppearanceBindingReadback>;
}
