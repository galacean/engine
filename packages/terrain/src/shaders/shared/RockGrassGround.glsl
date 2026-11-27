#ifndef TERRAIN_PROJECT_ROCK_GRASS_GROUND_INCLUDED
#define TERRAIN_PROJECT_ROCK_GRASS_GROUND_INCLUDED

#include "shared/GrassSurfaceField.glsl"
#include "shared/SurfaceRelief.glsl"

#ifndef TERRAIN_PROJECT_ROCK_COLOR_UNIFORM
#define TERRAIN_PROJECT_ROCK_COLOR_UNIFORM
vec3 material_RockColor;
#endif

vec4 terrainProjectRockGrassGround(float coverage, vec3 grass) {
  return vec4(mix(material_RockColor, grass, clamp(coverage, 0.0, 1.0)), 1.0);
}

#endif
