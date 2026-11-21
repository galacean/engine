#ifndef TERRAIN_PROJECT_LIGHTING_INCLUDED
#define TERRAIN_PROJECT_LIGHTING_INCLUDED

#include "ShaderLibrary/PBR/LightDirectPBR.glsl"
#include "ShaderLibrary/PBR/LightIndirectPBR.glsl"
#include "terrain/TerrainShadow.glsl"

struct TerrainProjectLightingResult {
  vec3 directDiffuse;
  vec3 directSpecular;
  vec3 environmentDiffuse;
  vec3 environmentSpecular;
  float shadowAttenuation;
};

TerrainProjectLightingResult evaluateTerrainProjectLightingWithShadow(Varyings varyings, SurfaceData surfaceData, float shadowAttenuation) {
  TerrainProjectLightingResult result;
  result.directDiffuse = vec3(0.0);
  result.directSpecular = vec3(0.0);
  result.environmentDiffuse = vec3(0.0);
  result.environmentSpecular = vec3(0.0);
  result.shadowAttenuation = shadowAttenuation;

  BSDFData bsdfData;
  initBSDFData(surfaceData, bsdfData);

  evaluateDirectRadiance(
    varyings,
    surfaceData,
    bsdfData,
    result.shadowAttenuation,
    result.directDiffuse,
    result.directSpecular
  );
  evaluateIBL(
    varyings,
    surfaceData,
    bsdfData,
    result.environmentDiffuse,
    result.environmentSpecular
  );
  return result;
}

#ifndef TERRAIN_PROJECT_GROUND_SHADOW_PCF
TerrainProjectLightingResult evaluateTerrainProjectLighting(Varyings varyings, SurfaceData surfaceData) {
  return evaluateTerrainProjectLightingWithShadow(varyings, surfaceData, sampleTerrainProjectShadow(varyings));
}
#endif

TerrainProjectLightingResult terrainProjectCreateLightingResult() {
  TerrainProjectLightingResult result;
  result.directDiffuse = vec3(0.0);
  result.directSpecular = vec3(0.0);
  result.environmentDiffuse = vec3(0.0);
  result.environmentSpecular = vec3(0.0);
  result.shadowAttenuation = 1.0;
  return result;
}

void terrainProjectAccumulateLighting(
  inout TerrainProjectLightingResult total,
  TerrainProjectLightingResult contribution,
  float weight
) {
  total.directDiffuse += contribution.directDiffuse * weight;
  total.directSpecular += contribution.directSpecular * weight;
  total.environmentDiffuse += contribution.environmentDiffuse * weight;
  total.environmentSpecular += contribution.environmentSpecular * weight;
  total.shadowAttenuation = contribution.shadowAttenuation;
}

vec3 terrainProjectFinalLighting(TerrainProjectLightingResult result) {
  return result.directDiffuse + result.directSpecular + result.environmentDiffuse + result.environmentSpecular;
}

#endif
