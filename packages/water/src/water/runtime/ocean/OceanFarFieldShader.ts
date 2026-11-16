/** Shared, low-frequency Ocean closure used on both sides of the finite presentation boundary. */
import type { ShaderData } from "@galacean/engine-core";
import { Vector2, Vector4 } from "@galacean/engine-math";
import oceanFarFieldShaderFunctions from "../../shaders/library/ocean/OceanFarField.glsl?raw";
import type { OceanRuntimeTuning } from "./OceanRuntimeTuning";

/**
 * Assumes camera/sun globals plus WaterSurfaceAmbientLighting declarations are in scope.
 * Keeping one source of truth makes the finite far field and projected Horizon radiometrically continuous.
 */
export const OCEAN_FAR_FIELD_SHADER_FUNCTIONS = oceanFarFieldShaderFunctions;

// Fixed far-LOD material-model assumption, retained for the default 512 appearance.
// The far pass omits detail-image sampling; this is not a measured statistic of
// arbitrary caller textures. An empty rough slot disables this contribution.
const ROUGH_WAVE_NORMAL_VARIANCE = 0.123;

export function deriveOceanFarReflectionFilter(
  tuning: Readonly<OceanRuntimeTuning>,
  roughNormalAvailable = true
): readonly [number, number] {
  const normalVariance = roughNormalAvailable ? ROUGH_WAVE_NORMAL_VARIANCE * tuning.reflection.distortion ** 2 : 0;
  const samplingRoughness = Math.min(1, (tuning.reflection.blur ** 4 + normalVariance) ** 0.25);
  return [samplingRoughness, normalVariance];
}

/** Writes the exact shared appearance parameters without allocating per frame. */
export function bindOceanFarFieldTuning(shaderData: ShaderData, tuning: Readonly<OceanRuntimeTuning>): void {
  shaderData.setFloat("material_ReflectionIntensity", tuning.reflection.strength);
  shaderData.setFloat("material_Roughness", tuning.reflection.blur);
  shaderData.setVector4("material_OceanDeepColor", new Vector4(...tuning.color.deep));
  shaderData.setVector4("material_OceanHorizonColor", new Vector4(...tuning.color.horizon));
  shaderData.setVector2(
    "material_OceanFarReflectionFilter",
    new Vector2(...deriveOceanFarReflectionFilter(tuning, shaderData.getFloat("material_OceanFarNormalEnabled") !== 0))
  );
}
