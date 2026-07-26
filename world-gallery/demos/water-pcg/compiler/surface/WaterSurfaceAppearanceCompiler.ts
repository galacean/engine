/** Public deterministic compiler for pure-data water surface appearance assets. */
import { hashStableValue } from "../shared/determinism";
import type {
  CompiledWaterSurfaceAppearanceV1,
  WaterSurfaceAppearanceCompileResult,
  WaterSurfaceAppearanceVariantKey
} from "./CompiledWaterSurfaceAppearanceTypes";
import { validateWaterSurfaceAppearanceAsset } from "./WaterSurfaceAppearanceValidator";

const WATER_SURFACE_APPEARANCE_COMPILER_VERSION = 1;
const SURFACE_APPEARANCE_V1_VARIANT_KEY: WaterSurfaceAppearanceVariantKey = "surface-appearance-v1";

export class WaterSurfaceAppearanceCompiler {
  private constructor() {}

  static compile(source: unknown): WaterSurfaceAppearanceCompileResult {
    const validation = validateWaterSurfaceAppearanceAsset(source);
    if (!validation.valid || !validation.value) {
      return Object.freeze({ valid: false, diagnostics: validation.diagnostics });
    }
    const appearance = validation.value;
    const appearanceHash = hashStableValue({
      compilerVersion: WATER_SURFACE_APPEARANCE_COMPILER_VERSION,
      appearance
    });
    const data: CompiledWaterSurfaceAppearanceV1 = Object.freeze({
      schemaVersion: appearance.schemaVersion,
      sourceId: appearance.id,
      appearanceHash,
      variantKey: SURFACE_APPEARANCE_V1_VARIANT_KEY,
      normal: appearance.normal,
      depthTint: appearance.depthTint,
      coastalAlpha: appearance.coastalAlpha,
      contactFoam: appearance.contactFoam,
      diagnostics: validation.diagnostics
    });
    return Object.freeze({ valid: true, data, diagnostics: validation.diagnostics });
  }
}
