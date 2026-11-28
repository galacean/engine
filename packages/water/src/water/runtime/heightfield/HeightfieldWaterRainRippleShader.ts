/** Terrain-atlas rain ripples driven by shared scene weather uniforms. */
import { WaterQualityTier } from "../../authoring/wave/enums/WaterQualityTier";
import heightfieldWaterRainRippleShaderFunctions from "../../shaders/library/heightfield/HeightfieldWaterRainRipple.glsl?raw";
import heightfieldWaterRainRippleLayeredNormalStatements from "../../shaders/library/heightfield/HeightfieldWaterRainRippleLayeredStatements.glsl?raw";
import heightfieldWaterRainRippleLowNormalStatements from "../../shaders/library/heightfield/HeightfieldWaterRainRippleLowStatements.glsl?raw";

export const HEIGHTFIELD_WATER_RAIN_RIPPLE_SHADER_FUNCTIONS = heightfieldWaterRainRippleShaderFunctions;

/** Emits one Terrain-style atlas field for Low and two rotated fields for Medium/High. */
export function createHeightfieldWaterRainRippleNormalStatements(quality: WaterQualityTier): string {
  return quality === WaterQualityTier.Low
    ? heightfieldWaterRainRippleLowNormalStatements
    : heightfieldWaterRainRippleLayeredNormalStatements;
}
