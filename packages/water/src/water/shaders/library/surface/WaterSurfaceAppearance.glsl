#ifndef WATER_SURFACE_APPEARANCE_INCLUDED
#define WATER_SURFACE_APPEARANCE_INCLUDED

{{NORMAL_FUNCTIONS}}
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

#endif
