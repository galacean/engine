import normalFunctions from "../../shaders/library/surface/WaterSurfaceNormalFunctions.glsl?raw";
import { renderWaterShaderTemplate } from "../material/WaterShaderTemplate";
import waterSurfaceAppearanceShaderFunctions from "../../shaders/library/surface/WaterSurfaceAppearance.glsl?raw";

/** Shared GLSL helpers for the opt-in Surface Appearance shader and controlled GPU calibration. */

/**
 * Keeps the compact Appearance formulas in one source so the production
 * Heightfield shader and transient validation fixture cannot drift.
 */
export function createWaterSurfaceAppearanceShaderFunctions(): string {
  return renderWaterShaderTemplate(waterSurfaceAppearanceShaderFunctions, { NORMAL_FUNCTIONS: normalFunctions });
}

/** Normal decoding and blending only; safe for geometry/SSR receiver passes. */
export function createWaterSurfaceNormalShaderFunctions(): string {
  return normalFunctions;
}
