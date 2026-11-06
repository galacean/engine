import waterSurfaceBrdfShaderFunctions from "../../shaders/library/surface/WaterSurfaceBrdf.glsl?raw";

/** GLSL helpers aligned with the Wave shader and CPU water-surface BRDF oracle. */

export const WATER_SURFACE_BRDF_MINIMUM_PERCEPTUAL_ROUGHNESS = 0.045;
export const WATER_SURFACE_BRDF_EPSILON = 0.000001;
export const WATER_SURFACE_BRDF_RECIPROCAL_PI = 0.3183098861837907;
export const WATER_SURFACE_BRDF_PI = 3.141592653589793;

/**
 * Returns the isotropic GGX/Schlick/height-correlated Smith functions used by
 * Appearance shaders. Callers supply all lighting inputs and composition policy.
 */
export function createWaterSurfaceBrdfShaderFunctions(): string {
  return waterSurfaceBrdfShaderFunctions;
}
