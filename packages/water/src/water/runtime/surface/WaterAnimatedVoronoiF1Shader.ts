/** Bounded GLSL generator for animated F1 Voronoi boundary patterns. */
import type { WaterContactFoamOctaveCount } from "./WaterContactFoam";
import waterAnimatedVoronoiF1ShaderTemplate from "../../shaders/library/surface/WaterAnimatedVoronoiF1.glsl?raw";
import { renderWaterShaderTemplate } from "../material/WaterShaderTemplate";

/**
 * Generates one fixed-cost animated F1 module backed by the shared 128x128 R8
 * periodic Voronoi texture using dual-speed UV blending (2 texture taps, 0 sin/sqrt ALU).
 */
export function createWaterAnimatedVoronoiF1ShaderFunctions(octaveCount: WaterContactFoamOctaveCount): string {
  return renderWaterShaderTemplate(waterAnimatedVoronoiF1ShaderTemplate, {
    OCTAVE_COUNT: octaveCount
  });
}
