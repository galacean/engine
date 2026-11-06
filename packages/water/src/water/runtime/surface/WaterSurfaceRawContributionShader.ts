import waterSurfaceRawContributionShaderFunctions from "../../shaders/library/surface/WaterSurfaceRawContribution.glsl?raw";

/** Shared V2 policy that turns backend raw samples/facts into final Closure contributions. */
export function createWaterSurfaceRawContributionShaderFunctions(): string {
  return waterSurfaceRawContributionShaderFunctions;
}
