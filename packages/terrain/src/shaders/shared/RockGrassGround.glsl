#ifndef TERRAIN_PROJECT_ROCK_GRASS_GROUND_INCLUDED
#define TERRAIN_PROJECT_ROCK_GRASS_GROUND_INCLUDED

#include "shared/GrassSurfaceField.glsl"
#include "shared/RockSurfaceColor.glsl"
#include "shared/SurfaceRelief.glsl"

#ifndef TERRAIN_PROJECT_ROCK_COLOR_UNIFORM
#define TERRAIN_PROJECT_ROCK_COLOR_UNIFORM
vec3 material_RockColor;
#endif

// Descriptor: interpolated grass coverage, source texture offset, painted flag.
// The same compact record is consumed by the rock surface and its grass roots.
vec4 terrainProjectRockGrassGround(vec3 positionWS, vec3 normal, vec3 descriptor, vec3 grass) {
  float coverage = clamp(descriptor.x, 0.0, 1.0);
  vec3 stone = material_RockColor;
  if (coverage < 0.9999 && descriptor.z > 0.5) {
    stone *= originalRockColor(positionWS, normal, descriptor.y);
  }
  return vec4(mix(stone, grass, coverage), mix(mix(0.88, 0.8, descriptor.z), 1.0, coverage));
}

#endif
