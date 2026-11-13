/** Deterministic, allocation-free GLSL helpers for Scene Depth contact foam. */
import {
  WATER_CONTACT_FOAM_FINITE_MAGNITUDE_LIMIT,
  WATER_CONTACT_FOAM_HASH_MODULUS,
  WATER_CONTACT_FOAM_HASH_MULTIPLIER,
  WATER_CONTACT_FOAM_HASH_OFFSET,
  WATER_CONTACT_FOAM_HASH_SCALE_X,
  WATER_CONTACT_FOAM_HASH_SCALE_Y,
  WATER_CONTACT_FOAM_MAX_F1_SQUARED,
  WATER_CONTACT_FOAM_PHASE_PERIOD,
  type WaterContactFoamOctaveCount
} from "./WaterContactFoam";
import waterContactFoamShaderTemplate from "../../shaders/library/surface/WaterContactFoam.glsl?raw";
import { renderWaterShaderTemplate } from "../material/WaterShaderTemplate";

function glsl(value: number): string {
  return Number.isInteger(value) ? `${value}.0` : String(value);
}

/**
 * Generates a fixed one-, two-, or three-octave module. The 3x3 F1 search and
 * active octave calls are unrolled so callers choose only Medium or High cost.
 */
export function createWaterContactFoamShaderFunctions(octaveCount: WaterContactFoamOctaveCount): string {
  return renderWaterShaderTemplate(waterContactFoamShaderTemplate, {
    HASH_MODULUS: glsl(WATER_CONTACT_FOAM_HASH_MODULUS),
    PHASE_PERIOD: glsl(WATER_CONTACT_FOAM_PHASE_PERIOD),
    FINITE_LIMIT: WATER_CONTACT_FOAM_FINITE_MAGNITUDE_LIMIT.toExponential(),
    HASH_MULTIPLIER: glsl(WATER_CONTACT_FOAM_HASH_MULTIPLIER),
    HASH_OFFSET: glsl(WATER_CONTACT_FOAM_HASH_OFFSET),
    HASH_SCALE_X: glsl(WATER_CONTACT_FOAM_HASH_SCALE_X),
    HASH_SCALE_Y: glsl(WATER_CONTACT_FOAM_HASH_SCALE_Y),
    MAX_F1_SQUARED: glsl(WATER_CONTACT_FOAM_MAX_F1_SQUARED),
    OCTAVE_COUNT: octaveCount
  });
}
