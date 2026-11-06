#ifndef TERRAIN_PROJECT_LIGHTING_INCLUDED
#define TERRAIN_PROJECT_LIGHTING_INCLUDED

#include "ShaderLibrary/PBR/LightDirectPBR.glsl"
#include "ShaderLibrary/PBR/LightIndirectPBR.glsl"
#include "shared/Shadow.glsl"

struct TerrainProjectLightingResult {
  vec3 directDiffuse;
  vec3 directSpecular;
  vec3 environmentDiffuse;
  vec3 environmentSpecular;
  float shadowAttenuation;
};

#ifndef TERRAIN_PROJECT_PREPARE_ALBEDO
  #define TERRAIN_PROJECT_PREPARE_ALBEDO(viewDirection, albedoColor, shadowAttenuation) albedoColor
#endif

TerrainProjectLightingResult evaluateTerrainProjectLightingWithShadow(Varyings varyings, SurfaceData surfaceData, float shadowAttenuation) {
  TerrainProjectLightingResult result;
  result.directDiffuse = vec3(0.0);
  result.directSpecular = vec3(0.0);
  result.environmentDiffuse = vec3(0.0);
  result.environmentSpecular = vec3(0.0);
  result.shadowAttenuation = shadowAttenuation;
  surfaceData.albedoColor = TERRAIN_PROJECT_PREPARE_ALBEDO(
    surfaceData.viewDir,
    surfaceData.albedoColor,
    result.shadowAttenuation
  );

  BSDFData bsdfData;
  initBSDFData(surfaceData, bsdfData);

  float directShadowAttenuation = result.shadowAttenuation;
  #if (defined(RENDERER_PROCEDURAL_TREE_GPU_LEAF_FRAME) || defined(RENDERER_PROCEDURAL_PLANT_CANOPY_OCCLUSION)) && defined(MATERIAL_PROCEDURAL_TREE_CANOPY_OCCLUSION)
    // Shadow maps own resolved near-field visibility. As their engine-authored fade
    // reaches one, the main directional light transfers to the generator's conserved
    // canopy proxy instead of letting distant crowns become uniformly sunlit.
    float canopyDirectFallbackWeight = 1.0;
    #ifdef NEED_CALCULATE_SHADOWS
      canopyDirectFallbackWeight = getShadowFade(varyings.positionWS);
    #endif
    float canopyDirectVisibility = mix(
      1.0,
      clamp(surfaceData.ambientOcclusion, 0.0, 1.0),
      canopyDirectFallbackWeight
    );
    #ifdef NEED_CALCULATE_SHADOWS
      directShadowAttenuation *= canopyDirectVisibility;
    #endif
  #endif
  evaluateDirectRadiance(
    varyings,
    surfaceData,
    bsdfData,
    directShadowAttenuation,
    result.directDiffuse,
    result.directSpecular
  );
  #if (defined(RENDERER_PROCEDURAL_TREE_GPU_LEAF_FRAME) || defined(RENDERER_PROCEDURAL_PLANT_CANOPY_OCCLUSION)) && \
    defined(MATERIAL_PROCEDURAL_TREE_CANOPY_OCCLUSION) && !defined(NEED_CALCULATE_SHADOWS)
    result.directDiffuse *= canopyDirectVisibility;
    result.directSpecular *= canopyDirectVisibility;
  #endif
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

#ifdef TERRAIN_PROJECT_WATER_LAYER
  void terrainProjectApplyWaterFilmLighting(
    Varyings varyings,
    SurfaceData substrate,
    TerrainProjectWaterFilm waterFilm,
    inout TerrainProjectLightingResult result
  ) {
    if (waterFilm.coverage > 0.0) {
      // The water interface transmits the remaining energy to the already evaluated substrate.
      // Terrain owns this water-film interface explicitly and evaluates it with the standard BSDF.
      float waterFresnel = F_Schlick(terrainProjectWaterF0(), 1.0, waterFilm.dotNV);
      float substrateTransmission = 1.0 - waterFilm.coverage * waterFresnel;
      result.directDiffuse *= substrateTransmission;
      result.directSpecular *= substrateTransmission;
      result.environmentDiffuse *= substrateTransmission;
      result.environmentSpecular *= substrateTransmission;

      SurfaceData waterSurface = terrainProjectBuildWaterFilmSurface(substrate, waterFilm);
      BSDFData waterBsdfData;
      initBSDFData(waterSurface, waterBsdfData);
      vec3 unusedDiffuse = vec3(0.0);
      vec3 directSpecular = vec3(0.0);
      float shadowAttenuation = result.shadowAttenuation;
      evaluateDirectRadiance(
        varyings,
        waterSurface,
        waterBsdfData,
        shadowAttenuation,
        unusedDiffuse,
        directSpecular
      );
      vec3 environmentDiffuse = vec3(0.0);
      vec3 environmentSpecular = vec3(0.0);
      evaluateIBL(
        varyings,
        waterSurface,
        waterBsdfData,
        environmentDiffuse,
        environmentSpecular
      );
      float reflectionIntensity = scene_TerrainWaterCoverageParams.z;
      result.directSpecular += directSpecular * waterFilm.coverage * reflectionIntensity;
      result.environmentSpecular += environmentSpecular * waterFilm.coverage * reflectionIntensity;
    }
  }
#endif

vec3 terrainProjectFinalLighting(TerrainProjectLightingResult result) {
  return result.directDiffuse + result.directSpecular + result.environmentDiffuse + result.environmentSpecular;
}

#endif
