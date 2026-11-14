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

#endif
