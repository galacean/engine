#ifndef TERRAIN_PROJECT_FARM_GROUND_BLEND_INCLUDED
#define TERRAIN_PROJECT_FARM_GROUND_BLEND_INCLUDED

#include "shared/TerrainGroundBlend.glsl"

#ifdef SCENE_FARM_GROUND_APPEARANCE
sampler2D scene_FarmGroundCoverage;
sampler2D scene_FarmGroundPages;
sampler2D scene_FarmGroundColor;
vec4 scene_FarmGroundDomain;
vec4 scene_FarmGroundAtlasSize;
// XY page count; ZW the native river/road coverage-to-clump-size thresholds.
vec4 scene_FarmGroundPageSize;
float scene_FarmWorkReveal;
#endif

float terrainProjectFarmGroundCoverage(vec2 worldXZ) {
  #ifdef SCENE_FARM_GROUND_APPEARANCE
    vec2 grid = (worldXZ - scene_FarmGroundDomain.xy) / scene_FarmGroundDomain.z;
    vec2 page = floor(grid);
    if (any(lessThan(page, vec2(0.0))) || any(greaterThanEqual(page, scene_FarmGroundPageSize.xy))) return 0.0;
    vec2 code = floor(texture2D(scene_FarmGroundPages, (page + 0.5) / scene_FarmGroundPageSize.xy).rg * 255.0 + 0.5);
    float slot = code.x + code.y * 256.0 - 1.0;
    if (slot < 0.0) return 0.0;
    vec2 tile = vec2(mod(slot, scene_FarmGroundAtlasSize.z), floor(slot / scene_FarmGroundAtlasSize.z));
    vec2 uv = (tile * scene_FarmGroundDomain.w + fract(grid) * (scene_FarmGroundDomain.w - 1.0) + 0.5) / scene_FarmGroundAtlasSize.xy;
    vec2 coverage = texture2D(scene_FarmGroundCoverage, uv).rg;
    // Existing ground stays unchanged; newly added mud fades in uniformly.
    if (coverage.r == coverage.g) return coverage.g;
    float reveal = clamp(scene_FarmWorkReveal, 0.0, 1.0);
    return mix(coverage.r, coverage.g, reveal);
  #endif
  return 0.0;
}

// Match seedWorldGrassCoverageScale, including already CPU-scaled river/road clumps.
float terrainProjectFarmGrassScale(float originalGrassCoverage, float dirtWeight) {
  #ifdef SCENE_FARM_GROUND_APPEARANCE
    float start = scene_FarmGroundPageSize.z;
    float range = scene_FarmGroundPageSize.w - start;
    float before = clamp((originalGrassCoverage - start) / range, 0.0, 1.0);
    float after = clamp((originalGrassCoverage * (1.0 - dirtWeight) - start) / range, 0.0, 1.0);
    return before > 0.0 ? after / before : 0.0;
  #endif
  return 1.0;
}

vec3 terrainProjectBlendFarmGroundColor(vec3 baseColor, vec2 worldXZ, float weight) {
  #ifdef SCENE_FARM_GROUND_APPEARANCE
    if (weight > 0.0) {
      // Use the river-bed blend itself. Terrain and grass now share the entire substrate,
      // without a second farm-only colour ramp towards the blade tip.
      return terrainProjectBlendGroundBedColor(baseColor, 1.0 - weight, worldXZ,
        scene_FarmGroundColor, vec4(scene_FarmGroundAtlasSize.ww, 1.0, 0.0));
    }
  #endif
  return baseColor;
}

vec3 terrainProjectBlendFarmGroundColor(vec3 baseColor, vec2 worldXZ) {
  return terrainProjectBlendFarmGroundColor(baseColor, worldXZ, terrainProjectFarmGroundCoverage(worldXZ));
}

#endif
