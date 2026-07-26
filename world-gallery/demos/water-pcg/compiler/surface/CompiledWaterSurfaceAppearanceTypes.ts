/** Engine-object-free output contracts for surface appearance compilation. */
import type {
  WaterSurfaceAppearanceDiagnostic,
  WaterSurfaceAppearanceSchemaVersion,
  WaterSurfaceCoastalAlphaAppearance,
  WaterSurfaceContactFoamAppearance,
  WaterSurfaceDepthTintAppearance,
  WaterSurfaceNormalAppearance
} from "../../authoring/surface/WaterSurfaceAppearanceTypes";

export type WaterSurfaceAppearanceVariantKey = "surface-appearance-v1";

export interface CompiledWaterSurfaceAppearanceV1 {
  readonly schemaVersion: WaterSurfaceAppearanceSchemaVersion.V1;
  readonly sourceId: string;
  readonly appearanceHash: string;
  /**
   * Stable shader-family key. Per-asset values and A/B feature flags do not
   * create additional variants.
   */
  readonly variantKey: WaterSurfaceAppearanceVariantKey;
  readonly normal: WaterSurfaceNormalAppearance;
  readonly depthTint: WaterSurfaceDepthTintAppearance;
  readonly coastalAlpha: WaterSurfaceCoastalAlphaAppearance;
  readonly contactFoam: WaterSurfaceContactFoamAppearance;
  readonly diagnostics: readonly WaterSurfaceAppearanceDiagnostic[];
}

export interface WaterSurfaceAppearanceCompileResult {
  readonly valid: boolean;
  readonly data?: CompiledWaterSurfaceAppearanceV1;
  readonly diagnostics: readonly WaterSurfaceAppearanceDiagnostic[];
}
