/** Shared GLSL helpers for the opt-in Surface Appearance shader and controlled GPU calibration. */

/**
 * Keeps the compact Appearance formulas in one source so the production
 * Heightfield shader and transient validation fixture cannot drift.
 */
export function createWaterSurfaceAppearanceShaderFunctions(): string {
  return `
vec3 waterSurfaceAppearanceSafeNormalize3(vec3 value, vec3 fallbackValue) {
  float lengthSquared = dot(value, value);
  return lengthSquared > 0.000001
    ? value * inversesqrt(lengthSquared)
    : fallbackValue;
}

vec3 waterSurfaceAppearanceDecodeTangentNormal(
  vec4 packedNormal,
  float strength,
  float flipGreen
) {
  vec2 slope = packedNormal.rg * 2.0 - 1.0;
  slope.y *= mix(1.0, -1.0, step(0.5, flipGreen));
  slope *= strength;
  float normalZ = sqrt(max(1.0 - dot(slope, slope), 0.0001));
  normalZ = mix(1.0, normalZ, clamp(strength, 0.0, 1.0));
  return waterSurfaceAppearanceSafeNormalize3(
    vec3(slope, normalZ),
    vec3(0.0, 0.0, 1.0)
  );
}

vec3 waterSurfaceAppearanceBlendTangentNormals(
  vec3 firstNormal,
  vec3 secondNormal
) {
  return waterSurfaceAppearanceSafeNormalize3(
    vec3(firstNormal.xy + secondNormal.xy, firstNormal.z * secondNormal.z),
    vec3(0.0, 0.0, 1.0)
  );
}

float waterSurfaceAppearanceDepthTintFactor(
  float sceneDepthDelta,
  float distance,
  float exponent
) {
  return pow(
    clamp(sceneDepthDelta / max(distance, 0.0001), 0.0, 1.0),
    max(exponent, 0.0001)
  );
}

float waterSurfaceAppearanceCoastalAlpha(
  float sceneDepthDelta,
  float distance
) {
  return clamp(sceneDepthDelta / max(distance, 0.0001), 0.0, 1.0);
}

vec2 waterSurfaceAppearanceRefractionUvDelta(
  vec2 normalDelta,
  float strength
) {
  return normalDelta * max(strength, 0.0);
}

float waterSurfaceAppearanceRefractionSampleValidity(
  float screenInterior,
  float depthContinuity,
  float geometryBehindSurface,
  float centeredDepthBehind,
  float refractedSceneDepthFinite
) {
  return clamp(screenInterior, 0.0, 1.0)
    * clamp(depthContinuity, 0.0, 1.0)
    * clamp(geometryBehindSurface, 0.0, 1.0)
    * clamp(centeredDepthBehind, 0.0, 1.0)
    * clamp(refractedSceneDepthFinite, 0.0, 1.0);
}
`;
}
