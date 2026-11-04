#ifndef TERRAIN_PROJECT_GROUND_WIND_APPEARANCE_INCLUDED
#define TERRAIN_PROJECT_GROUND_WIND_APPEARANCE_INCLUDED

vec3 terrainProjectGroundWindColorNormal(
  vec3 baseNormalWS,
  vec3 windFieldNormalWS,
  float heightWeight,
  float colorContrast
) {
  vec3 baseNormal = normalize(baseNormalWS);
  vec3 windFieldNormal = normalize(windFieldNormalWS);
  float contrastAmount = clamp((colorContrast - 0.5) / 3.5, 0.0, 1.0);
  float normalGain = mix(0.9, 1.1, contrastAmount);
  return normalize(
    baseNormal +
    (windFieldNormal - vec3(0.0, 1.0, 0.0)) *
    (normalGain * clamp(heightWeight, 0.0, 1.0))
  );
}

float terrainProjectGroundWindColorHeightWeight(float structuralWeight) {
  return smoothstep(0.22, 0.82, clamp(structuralWeight, 0.0, 1.0));
}

float terrainProjectGroundWindLightingBand(
  float rawLightingSweep,
  float baseLightingSweep,
  float colorContrast
) {
  float contrastAmount = clamp((colorContrast - 0.5) / 3.5, 0.0, 1.0);
  float rampCenter = clamp(
    mix(0.5, baseLightingSweep, 0.12),
    0.42,
    0.58
  );
  float rampHalfWidth = mix(0.32, 0.06, contrastAmount);
  return smoothstep(
    rampCenter - rampHalfWidth,
    rampCenter + rampHalfWidth,
    clamp(rawLightingSweep, 0.0, 1.0)
  );
}

float terrainProjectGroundWindDarkMix(float lightingSweep, float colorContrast) {
  float shadowResponse = 1.0 - clamp(lightingSweep, 0.0, 1.0);
  float shapedShadowResponse = pow(
    shadowResponse,
    1.0 / max(colorContrast, 0.001)
  );
  return 0.811136 * shapedShadowResponse;
}

vec3 terrainProjectApplyGroundWindLightingColor(
  vec3 litColor,
  vec3 inheritedShadowColor,
  float lightingSweep,
  float colorStrength,
  float colorContrast
) {
  float strength = clamp(colorStrength, 0.0, 1.0);
  float darkMix = terrainProjectGroundWindDarkMix(lightingSweep, colorContrast);
  vec3 colorized = mix(litColor, inheritedShadowColor, darkMix * strength);
  float multiplyMask = 1.0 - darkMix;
  return mix(colorized, colorized * multiplyMask, 0.275 * strength);
}

vec3 terrainProjectApplyGrassGroundWindColor(
  vec3 litColor,
  float lightingSweep,
  float colorStrength,
  float colorContrast
) {
  vec3 inheritedShadowColor = max(litColor, vec3(0.0)) * 0.24;
  return terrainProjectApplyGroundWindLightingColor(
    litColor,
    inheritedShadowColor,
    lightingSweep,
    colorStrength,
    colorContrast
  );
}

vec3 terrainProjectApplyFlowerGroundWindColor(
  vec3 litColor,
  vec3 baseColor,
  float lightingSweep,
  float colorStrength,
  float colorContrast
) {
  vec3 inheritedColor = mix(
    max(litColor, vec3(0.0)),
    max(baseColor, vec3(0.0)),
    0.25
  );
  vec3 inheritedShadowColor = inheritedColor * 0.24;
  return terrainProjectApplyGroundWindLightingColor(
    litColor,
    inheritedShadowColor,
    lightingSweep,
    colorStrength,
    colorContrast
  );
}

#endif
