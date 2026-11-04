#ifndef TERRAIN_PROJECT_GRASS_GROUND_FUSION_INCLUDED
#define TERRAIN_PROJECT_GRASS_GROUND_FUSION_INCLUDED

#include "shared/GrassGroundAppearance.glsl"

// The authored clump's first visible body row reaches about 30.4% of its height, but dense
// overlapping blades hide that exact row in the final image. Keep the visible lower three
// quarters on the Terrain appearance path, then introduce blade-only appearance at the tips.
// Rain, retained puddles, snow and every season must use this same ownership weight.
const float TERRAIN_PROJECT_GRASS_ROOT_FUSION_HEIGHT = 0.75;
const float TERRAIN_PROJECT_GRASS_BLADE_APPEARANCE_HEIGHT = 1.0;

float terrainProjectGrassBladeAppearanceWeight(float tipWeight) {
  return smoothstep(
    TERRAIN_PROJECT_GRASS_ROOT_FUSION_HEIGHT,
    TERRAIN_PROJECT_GRASS_BLADE_APPEARANCE_HEIGHT,
    clamp(tipWeight, 0.0, 1.0)
  );
}

float terrainProjectGrassBladeShadeWeight(float tipWeight) {
  return terrainProjectGrassBladeAppearanceWeight(tipWeight) * smoothstep(0.25, 0.95, tipWeight);
}

vec3 terrainProjectGrassWindFieldNormal(vec3 groundNormal, vec3 carrierNormal, vec3 bentNormal) {
  return normalize(groundNormal + (carrierNormal - vec3(0.0, 1.0, 0.0)) * 0.45 +
    (bentNormal - vec3(0.0, 1.0, 0.0)));
}

#endif
