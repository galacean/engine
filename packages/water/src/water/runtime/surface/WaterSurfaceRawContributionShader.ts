import waterSurfaceRawContributionShaderFunctions from "../../shaders/library/surface/WaterSurfaceRawContribution.glsl?raw";
import { renderWaterShaderTemplate } from "../material/WaterShaderTemplate";

/** Shared V2 policy that turns backend raw samples/facts into final Closure contributions. */
export function createWaterSurfaceRawContributionShaderFunctions(surfaceFoamFacts = true): string {
  return renderWaterShaderTemplate(waterSurfaceRawContributionShaderFunctions, {
    SURFACE_FOAM_FACTS: Number(surfaceFoamFacts)
  });
}
