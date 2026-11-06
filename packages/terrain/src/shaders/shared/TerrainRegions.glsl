#ifndef TERRAIN_PROJECT_REGIONS_INCLUDED
#define TERRAIN_PROJECT_REGIONS_INCLUDED
#define TERRAIN_PROJECT_MAX_ACTIVE_REGIONS 32
#ifdef TERRAIN_GROUND_RENDERER
vec4 renderer_TerrainRegionWorldBounds[TERRAIN_PROJECT_MAX_ACTIVE_REGIONS];
#define GROUND_TerrainRegionWorldBounds renderer_TerrainRegionWorldBounds
#else
vec4 material_TerrainRegionWorldBounds[TERRAIN_PROJECT_MAX_ACTIVE_REGIONS];
#define GROUND_TerrainRegionWorldBounds material_TerrainRegionWorldBounds
#endif
#ifdef TERRAIN_GROUND_RENDERER
int renderer_TerrainRegionCount;
#define GROUND_TerrainRegionCount renderer_TerrainRegionCount
#else
int material_TerrainRegionCount;
#define GROUND_TerrainRegionCount material_TerrainRegionCount
#endif
int terrainProjectRegionIndex(vec2 worldXZ) {
  #ifdef MATERIAL_TERRAIN_SINGLE_REGION
    vec4 bounds = GROUND_TerrainRegionWorldBounds[0];
    vec2 minimum = bounds.xy;
    vec2 maximum = minimum + bounds.zw;
    #ifdef MATERIAL_TERRAIN_FIXED_SURFACE
      // Fixed triangles already bound coverage. MSAA may evaluate a covered edge
      // fragment at a pixel centre just outside the owning residency rectangle.
      return 0;
    #else
      return all(greaterThanEqual(worldXZ, minimum)) && all(lessThanEqual(worldXZ, maximum)) ? 0 : -1;
    #endif
  #else
  int inclusiveBoundaryCandidate = -1;
  vec2 candidateMinimum = vec2(-3.402823466e+38);
  for (int index = 0; index < TERRAIN_PROJECT_MAX_ACTIVE_REGIONS; index++) {
    if (index >= GROUND_TerrainRegionCount) {
      break;
    }
    vec4 bounds = GROUND_TerrainRegionWorldBounds[index];
    vec2 minimum = bounds.xy;
    vec2 maximum = minimum + bounds.zw;
    if (all(greaterThanEqual(worldXZ, minimum)) && all(lessThanEqual(worldXZ, maximum))) {
      if (all(lessThan(worldXZ, maximum))) {
        return index;
      }
      if (
        inclusiveBoundaryCandidate < 0 ||
        minimum.x > candidateMinimum.x ||
        (minimum.x == candidateMinimum.x && minimum.y > candidateMinimum.y)
      ) {
        inclusiveBoundaryCandidate = index;
        candidateMinimum = minimum;
      }
    }
  }
  #ifdef MATERIAL_TERRAIN_FIXED_SURFACE
    if (inclusiveBoundaryCandidate < 0) {
      float nearest = 3.402823466e+38;
      for (int index = 0; index < TERRAIN_PROJECT_MAX_ACTIVE_REGIONS; index++) {
        if (index >= GROUND_TerrainRegionCount) break;
        vec4 bounds = GROUND_TerrainRegionWorldBounds[index];
        vec2 delta = worldXZ - clamp(worldXZ, bounds.xy, bounds.xy + bounds.zw);
        float distanceSquared = dot(delta, delta);
        if (distanceSquared < nearest) { nearest = distanceSquared; inclusiveBoundaryCandidate = index; }
      }
    }
  #endif
  return inclusiveBoundaryCandidate;
  #endif
}


#endif
