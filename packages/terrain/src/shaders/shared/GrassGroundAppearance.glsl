#ifndef TERRAIN_PROJECT_GRASS_GROUND_APPEARANCE_INCLUDED
#define TERRAIN_PROJECT_GRASS_GROUND_APPEARANCE_INCLUDED

#include "shared/SceneSeason.glsl"
#include "shared/SurfaceClimate.glsl"
#include "shared/TerrainSurfaceData.glsl"

/** Builds the texture-free grass substrate used by Terrain and mountain-rock coverage. */
SurfaceData terrainProjectBuildGrassGroundSurface(
  Varyings varyings,
  vec3 nearLinearColor,
  vec3 farLinearColor,
  float vistaWeight,
  vec3 shadingNormal,
  vec3 geometryNormal,
  float snowResponse
) {
  // The shared colour field already resolved season and authored channels at its endpoints.
  vec3 seasonalColor = mix(
    nearLinearColor,
    farLinearColor,
    clamp(vistaWeight, 0.0, 1.0)
  );
  SurfaceData surfaceData = terrainProjectBuildSurfaceData(
    varyings,
    seasonalColor,
    normalize(shadingNormal),
    0.0,
    0.0,
    1.0
  );
  terrainProjectApplySurfaceClimate(
    surfaceData,
    normalize(geometryNormal),
    vec3(1.0, 1.0, max(snowResponse, 0.0))
  );
  return surfaceData;
}

#endif
