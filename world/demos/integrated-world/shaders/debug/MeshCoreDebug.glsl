#ifndef TERRAIN_PROJECT_MESH_CORE_DEBUG_INCLUDED
#define TERRAIN_PROJECT_MESH_CORE_DEBUG_INCLUDED

#include "debug/CoreDebug.glsl"

#define TERRAIN_PROJECT_DEBUG_LOD_FADE 7.0

vec3 terrainProjectMeshCoreDebugColor(
  SurfaceData surfaceData,
  TerrainProjectLightingResult lighting,
  vec3 geometryNormal
) {
  if (material_DebugView < TERRAIN_PROJECT_DEBUG_LOD_FADE - 0.5) {
    return terrainProjectCoreDebugColor(surfaceData, lighting, geometryNormal);
  }
  return vec3(terrainProjectLodFade() * 0.5 + 0.5);
}

#endif
