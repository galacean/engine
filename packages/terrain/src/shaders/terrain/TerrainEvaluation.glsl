#ifndef TERRAIN_PROJECT_TERRAIN_EVALUATION_INCLUDED
#define TERRAIN_PROJECT_TERRAIN_EVALUATION_INCLUDED

#ifndef MATERIAL_TERRAIN_FAR
  #define TERRAIN_PROJECT_SURFACE_RAIN_NORMALS
#endif
#include "shared/SurfaceClimate.glsl"
#include "shared/TerrainSurfaceData.glsl"
#include "shared/TerrainGroundBlend.glsl"

vec4 material_BaseColor;
float material_Metallic;
float material_Smoothness;
#include "shared/GrassGroundFusion.glsl"

const float TERRAIN_PROJECT_MIN_ADDITIVE_GROUP_WEIGHT = 0.005;

#ifdef MATERIAL_TERRAIN_DETAIL_TRANSITION
  float material_TerrainFarLod;
  // Share the geometry morph so the last near ring reaches the far appearance at its outer edge.
  float terrainProjectFarDetailVisibility(Varyings varyings) {
    float transitionLod = material_TerrainFarLod - 1.0;
    if (renderer_Lod < transitionLod - 0.5) return 1.0;
    if (renderer_Lod < transitionLod + 0.5) return 1.0 - varyings.clipmapMorph;
    return 0.0;
  }
#endif

// Fold distant wet sheen into the substrate's existing BRDF. The roughness floor
// keeps the highlight broad enough for coarse geometry without ripple normals.
void terrainProjectApplyFarWetSheen(inout SurfaceData surfaceData, vec3 geometryNormal, float visibility) {
  float coverage = terrainProjectSurfaceWetness(1.0)
    * clamp(scene_TerrainRippleParams.z * scene_TerrainWaterCoverageParams.x, 0.0, 1.0)
    * smoothstep(0.2, 0.75, geometryNormal.y)
    * visibility;
  float roughness = clamp(scene_TerrainWaterSurfaceParams.x, 0.24, 1.0);
  surfaceData.roughness = mix(surfaceData.roughness, min(surfaceData.roughness, roughness), coverage);
  surfaceData.specularIntensity *= mix(1.0, max(scene_TerrainWaterCoverageParams.z, 0.0), coverage);
}

void terrainProjectApplyTerrainClimate(
  inout SurfaceData surfaceData,
  Varyings varyings,
  vec3 geometryNormal,
  float snowResponse
  #ifdef TERRAIN_PROJECT_WATER_LAYER
    , out TerrainProjectWaterFilm waterFilm
  #endif
) {
  terrainProjectApplySurfaceMoisture(surfaceData, geometryNormal, vec2(1.0));
  float snow = terrainProjectTopSnowMask(surfaceData.position, geometryNormal, snowResponse);
  #ifdef TERRAIN_PROJECT_WATER_LAYER
    waterFilm = terrainProjectEvaluateSurfaceWaterFilm(surfaceData, geometryNormal, 1.0, snow);
    #ifdef MATERIAL_TERRAIN_DETAIL_TRANSITION
      float detailVisibility = terrainProjectFarDetailVisibility(varyings);
      waterFilm.coverage *= detailVisibility;
      terrainProjectApplyFarWetSheen(surfaceData, geometryNormal, 1.0 - detailVisibility);
    #endif
  #else
    terrainProjectApplyFarWetSheen(surfaceData, geometryNormal, 1.0);
  #endif
  // Apply snow last so covered terrain retains the snow BRDF instead of wet sheen.
  terrainProjectApplyTopSnowLayer(surfaceData, geometryNormal, snow, 0.82, 0.28);
  surfaceData.dotNV = clamp(dot(surfaceData.normal, surfaceData.viewDir), 0.0, 1.0);
}

#ifdef MATERIAL_TERRAIN_LAYERS
  #include "shared/TerrainLayerEvaluation.glsl"
  #ifndef MATERIAL_TERRAIN_FAR
    #include "shared/SurfaceRelief.glsl"
  #endif
  SurfaceData evaluateTerrainLayerSurface(
    Varyings varyings,
    vec3 geometryNormal,
    TerrainProjectLayerBlend layerBlend
    #ifdef TERRAIN_PROJECT_WATER_LAYER
      , out TerrainProjectWaterFilm waterFilm
    #endif
  ) {
    vec3 terrainAlbedo = terrainProjectGroundColor(layerBlend, varyings.positionWS);
    float grassCoverage = clamp(layerBlend.grassWeight, 0.0, 1.0);
    vec3 shadingNormal = terrainProjectLayerNormalToWorld(layerBlend.tangentNormal, geometryNormal);
    #if defined(MATERIAL_TERRAIN_GRASS_SHADING) && !defined(MATERIAL_TERRAIN_FAR)
      float surfaceReliefWeight = terrainProjectSurfaceReliefWeight(varyings.positionWS);
      #ifdef MATERIAL_TERRAIN_DETAIL_TRANSITION
        surfaceReliefWeight *= terrainProjectFarDetailVisibility(varyings);
      #endif
      if (surfaceReliefWeight > 0.0) {
        vec3 reliefNormal = terrainProjectSurfaceReliefNormal(varyings.positionWS, geometryNormal, grassCoverage);
        shadingNormal = normalize(mix(shadingNormal, reliefNormal, surfaceReliefWeight));
      }
    #endif
    SurfaceData surfaceData = terrainProjectBuildSurfaceData(
      varyings,
      terrainAlbedo,
      shadingNormal,
      layerBlend.metallic,
      layerBlend.smoothness,
      layerBlend.ambientOcclusion
    );
    terrainProjectApplyTerrainClimate(surfaceData, varyings, geometryNormal, layerBlend.snowResponse
      #ifdef TERRAIN_PROJECT_WATER_LAYER
        , waterFilm
      #endif
    );
    return surfaceData;
  }
#endif

SurfaceData evaluateTerrainFallbackSurface(
  Varyings varyings,
  vec3 geometryNormal
  #ifdef TERRAIN_PROJECT_WATER_LAYER
    , out TerrainProjectWaterFilm waterFilm
  #endif
) {
  SurfaceData surfaceData = terrainProjectBuildSurfaceData(
    varyings,
    material_BaseColor.rgb,
    geometryNormal,
    material_Metallic,
    material_Smoothness,
    1.0
  );
  terrainProjectApplyTerrainClimate(surfaceData, varyings, geometryNormal, 1.0
    #ifdef TERRAIN_PROJECT_WATER_LAYER
      , waterFilm
    #endif
  );
  return surfaceData;
}

#endif
