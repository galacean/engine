/** Engine-object-free output contracts for surface appearance compilation. */
import type {
  WaterBoundaryEffectV2,
  WaterSurfaceCausticsV2,
  WaterSurfaceAppearanceDiagnostic,
  WaterSurfaceAppearanceSchemaVersion,
  WaterSurfaceCompositionV2,
  WaterSurfaceDepthResponseV2,
  WaterSurfaceDirectionalHighlightV2,
  WaterSurfaceDetailLayerV2,
  WaterSurfacePrimaryColorClosure,
  WaterRefractionV2
} from "../../authoring/surface/WaterSurfaceAppearanceTypes";

export type WaterSurfaceAppearanceVariantKey = `surface-appearance-v2:${string}`;

export interface CompiledWaterSurfaceTextureReferenceV2 {
  readonly layerId: string;
  readonly textureAssetId: string;
  readonly textureContentHash: string;
}

/**
 * Bounded, engine-object-free surface closure. Structural choices enter the
 * variant key while numeric art values remain data/uniform inputs.
 */
export interface CompiledWaterSurfaceAppearanceV2 {
  readonly schemaVersion: WaterSurfaceAppearanceSchemaVersion.V2;
  readonly sourceId: string;
  readonly appearanceHash: string;
  readonly variantKey: `surface-appearance-v2:${string}`;
  readonly primaryColorClosure: WaterSurfacePrimaryColorClosure;
  readonly macroNormalStrength?: number;
  /** River flow-texture normal strength; independent of macro geometry and detail layers. */
  readonly flowNormalStrength?: number;
  /** Strength applied after blending detail normals, independently of refraction. */
  readonly detailNormalStrength?: number;
  readonly caustics?: WaterSurfaceCausticsV2;
  readonly directionalHighlight?: WaterSurfaceDirectionalHighlightV2;
  readonly detailLayers: readonly WaterSurfaceDetailLayerV2[];
  readonly depthResponse: WaterSurfaceDepthResponseV2;
  readonly boundaryEffects: readonly WaterBoundaryEffectV2[];
  readonly refraction: WaterRefractionV2;
  readonly composition: WaterSurfaceCompositionV2;
  readonly textureReferences: readonly CompiledWaterSurfaceTextureReferenceV2[];
  readonly maximumPatternOctaves: 0 | 1 | 2 | 3;
  readonly diagnostics: readonly WaterSurfaceAppearanceDiagnostic[];
}

export type CompiledWaterSurfaceAppearance = CompiledWaterSurfaceAppearanceV2;

export interface WaterSurfaceAppearanceCompileResult<
  Data extends CompiledWaterSurfaceAppearance = CompiledWaterSurfaceAppearance
> {
  readonly valid: boolean;
  readonly data?: Data;
  readonly diagnostics: readonly WaterSurfaceAppearanceDiagnostic[];
}
