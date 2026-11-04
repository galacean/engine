#ifndef TERRAIN_PROJECT_CORE_DEBUG_INCLUDED
#define TERRAIN_PROJECT_CORE_DEBUG_INCLUDED

#define TERRAIN_PROJECT_DEBUG_FINAL_LIT 0.0
#define TERRAIN_PROJECT_DEBUG_ALBEDO 1.0
#define TERRAIN_PROJECT_DEBUG_GEOMETRY_NORMAL 2.0
#define TERRAIN_PROJECT_DEBUG_SHADING_NORMAL 3.0
#define TERRAIN_PROJECT_DEBUG_DIRECT_LIGHT 4.0
#define TERRAIN_PROJECT_DEBUG_ENVIRONMENT_LIGHT 5.0
#define TERRAIN_PROJECT_DEBUG_SHADOW_ATTENUATION 6.0

float material_DebugView;

vec3 terrainProjectDebugNormal(vec3 normal) {
  return normalize(normal) * 0.5 + 0.5;
}

vec3 terrainProjectCoreDebugColor(
  SurfaceData surfaceData,
  TerrainProjectLightingResult lighting,
  vec3 geometryNormal
) {
  if (material_DebugView < TERRAIN_PROJECT_DEBUG_ALBEDO - 0.5) {
    return terrainProjectFinalLighting(lighting);
  }
  if (material_DebugView < TERRAIN_PROJECT_DEBUG_GEOMETRY_NORMAL - 0.5) {
    return surfaceData.albedoColor;
  }
  if (material_DebugView < TERRAIN_PROJECT_DEBUG_SHADING_NORMAL - 0.5) {
    return terrainProjectDebugNormal(geometryNormal);
  }
  if (material_DebugView < TERRAIN_PROJECT_DEBUG_DIRECT_LIGHT - 0.5) {
    return terrainProjectDebugNormal(surfaceData.normal);
  }
  if (material_DebugView < TERRAIN_PROJECT_DEBUG_ENVIRONMENT_LIGHT - 0.5) {
    return lighting.directDiffuse + lighting.directSpecular;
  }
  if (material_DebugView < TERRAIN_PROJECT_DEBUG_SHADOW_ATTENUATION - 0.5) {
    return lighting.environmentDiffuse + lighting.environmentSpecular;
  }
  return vec3(lighting.shadowAttenuation);
}

#endif
