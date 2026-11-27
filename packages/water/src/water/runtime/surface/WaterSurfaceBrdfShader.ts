import waterSurfaceBrdfShaderFunctions from "../../shaders/library/surface/WaterSurfaceBrdf.glsl?raw";

/**
 * Returns the isotropic GGX/Schlick/height-correlated Smith functions used by
 * Appearance shaders. Callers supply all lighting inputs and composition policy.
 */
export function createWaterSurfaceBrdfShaderFunctions(): string {
  return waterSurfaceBrdfShaderFunctions;
}
