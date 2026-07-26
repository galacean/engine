import type { Texture2D } from "@galacean/engine-core";
import type {
  WaterSurfaceAppearanceColor,
  WaterSurfaceCoastalAlphaModel,
  WaterSurfaceContactFoamModel,
  WaterSurfaceDepthTintModel
} from "../../authoring/surface/WaterSurfaceAppearanceTypes";
import type { CompiledWaterSurfaceAppearanceV1 } from "../../compiler/surface/CompiledWaterSurfaceAppearanceTypes";

export interface WaterSurfaceAppearanceBinding {
  readonly appearance: CompiledWaterSurfaceAppearanceV1;
  readonly assetId: string;
  readonly contentHash: string;
  readonly texture: Texture2D;
  readonly ownership: "borrowed";
}

export type WaterSurfaceAppearanceFallbackReason =
  | "surface-appearance-quality-unsupported"
  | "surface-appearance-compiled-data-unavailable"
  | "surface-appearance-normal-model-unsupported"
  | "surface-appearance-asset-id-mismatch"
  | "surface-appearance-content-hash-mismatch"
  | "surface-appearance-texture-unavailable"
  | "surface-appearance-ownership-invalid";

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
  readonly normalLayerCount: 0 | 2;
  readonly normalTiling: number;
  readonly normalScrollUvPerSecond: number;
  readonly normalStrength: number;
  readonly flipGreen: boolean;
  readonly depthTintModel?: WaterSurfaceDepthTintModel;
  readonly depthTintEnabled: boolean;
  readonly depthTintColor?: WaterSurfaceAppearanceColor;
  readonly depthTintDistance: number;
  readonly depthTintExponent: number;
  readonly coastalAlphaModel?: WaterSurfaceCoastalAlphaModel;
  readonly coastalAlphaEnabled: boolean;
  readonly coastalAlphaDistance: number;
  readonly contactFoamModel?: WaterSurfaceContactFoamModel;
  readonly contactFoamEnabled: boolean;
  readonly contactFoamWorldScale: number;
  readonly contactFoamTimeRate: number;
  readonly contactFoamOpacity: number;
  readonly contactFoamContactDistance: number;
  readonly contactFoamOctaveCount: 0 | 1 | 2 | 3;
  readonly contactFoamWeights: readonly number[];
  readonly contactFoamLacunarity: number;
  readonly contactFoamSuppressRefraction: number;
  readonly contactFoamSmoothnessReduction: number;
  readonly ownership?: "borrowed";
  readonly fallbackReason?: WaterSurfaceAppearanceFallbackReason;
}

export interface WaterSurfaceAppearanceBindingResolution {
  readonly binding?: Readonly<WaterSurfaceAppearanceBinding>;
  readonly readback: Readonly<WaterSurfaceAppearanceBindingReadback>;
}
