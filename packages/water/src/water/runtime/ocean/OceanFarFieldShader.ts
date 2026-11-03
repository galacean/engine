/** Shared, low-frequency Ocean closure used on both sides of the finite presentation boundary. */
import type { ShaderData } from "@galacean/engine-core";
import { Vector2, Vector4 } from "@galacean/engine-math";
import oceanFarFieldShaderFunctions from "../../shaders/library/ocean/OceanFarField.glsl?raw";
import oceanDiagnostics from "../../shaders/library/ocean/OceanDiagnostics.glsl?raw";
import type { OceanRuntimeTuning } from "./OceanRuntimeTuning";

/**
 * Assumes camera/sun globals plus WaterSurfaceAmbientLighting declarations are in scope.
 * Keeping one source of truth makes the finite far field and projected Horizon radiometrically continuous.
 */
export const OCEAN_FAR_FIELD_SHADER_FUNCTIONS = oceanDiagnostics + "\n" + oceanFarFieldShaderFunctions;

// Per-axis second moment of two RNM-blended RoughWaves layers (linear normal data).
// Calibrated from the bundled 1024px source: 65,536 sample pairs yield 0.1223.
// The fixed asset distribution is scaled by the actual reflection-normal blend.
const ROUGH_WAVE_NORMAL_VARIANCE = 0.123;

/** Called only when the Look changes, never per frame. */
export function deriveOceanFarReflectionFilter(tuning: Readonly<OceanRuntimeTuning>): readonly [number, number] {
  const normalVariance = ROUGH_WAVE_NORMAL_VARIANCE * tuning.reflection.distortion ** 2;
  const samplingRoughness = Math.min(1, (tuning.reflection.blur ** 4 + normalVariance) ** 0.25);
  return [samplingRoughness, normalVariance];
}

/** Writes the exact shared appearance parameters without allocating per frame. */
export function bindOceanFarFieldTuning(shaderData: ShaderData, tuning: Readonly<OceanRuntimeTuning>): void {
  shaderData.setFloat("material_ReflectionIntensity", tuning.reflection.strength);
  shaderData.setFloat("material_Roughness", tuning.reflection.blur);
  shaderData.setVector4("material_OceanDeepColor", new Vector4(...tuning.color.deep));
  shaderData.setVector4("material_OceanHorizonColor", new Vector4(...tuning.color.horizon));
  shaderData.setVector2("material_OceanFarReflectionFilter", new Vector2(...deriveOceanFarReflectionFilter(tuning)));
}
