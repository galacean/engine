/** Bounded GLSL generator for animated F1 Voronoi boundary patterns. */
import type { WaterContactFoamOctaveCount } from "./WaterContactFoam";
import waterAnimatedVoronoiF1ShaderTemplate from "../../shaders/library/surface/WaterAnimatedVoronoiF1.glsl?raw";
import { renderWaterShaderTemplate } from "../material/WaterShaderTemplate";

/**
 * Generates one fixed-cost animated F1 module. The 3x3 cell search and active
 * octaves are unrolled so authoring cannot introduce data-dependent loops.
 */
export function createWaterAnimatedVoronoiF1ShaderFunctions(octaveCount: WaterContactFoamOctaveCount): string {
  return renderWaterShaderTemplate(waterAnimatedVoronoiF1ShaderTemplate, {
    OCTAVE_COUNT: octaveCount
  });
}
