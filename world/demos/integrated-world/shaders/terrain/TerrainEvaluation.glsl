#ifndef TERRAIN_PROJECT_TERRAIN_EVALUATION_INCLUDED
#define TERRAIN_PROJECT_TERRAIN_EVALUATION_INCLUDED

#ifndef MATERIAL_TERRAIN_SEED_FAR_COMPOSITE
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

#ifdef MATERIAL_TERRAIN_LAYERS
  #include "shared/TerrainLayerEvaluation.glsl"
  #include "shared/SurfaceRelief.glsl"
  #ifdef MATERIAL_TERRAIN_SEED_FAR_TRANSITION
    float terrainProjectFarDetailVisibility(Varyings varyings) {
      float transitionLod = material_TerrainFarCompositeLod - 1.0;
      if (renderer_Lod < transitionLod - 0.5) return 1.0;
      if (renderer_Lod < transitionLod + 0.5) return 1.0 - varyings.clipmapMorph;
      return 0.0;
    }
  #endif


  #ifdef MATERIAL_TERRAIN_SEED_FIXED_LAYERS
    vec4 material_TerrainSeedLayerColor1;
    vec4 material_TerrainSeedLayerColor2;
    vec4 material_TerrainSeedLayerSnowResponse;
  #endif
  #ifdef MATERIAL_TERRAIN_SEED_FIXED_LAYERS
    vec4 terrainProjectSampleSeedFixedLayerWeights(vec2 worldXZ, out float totalWeight) {
      vec4 bounds = material_TerrainRegionWorldBounds[0];
      vec4 rect = texelFetch(material_TerrainAlphamapMetadata, ivec2(0, 0), 0);
      vec4 weights = terrainProjectSampleGroundLayerWeights(
        material_TerrainAlphamapAtlas, material_TerrainAlphamapAtlasInvSize,
        rect, bounds, worldXZ, totalWeight
      );
      return weights;
    }

    vec3 terrainProjectSeedFixedNonGrassColor(vec3 color) {
      return color;
    }

    TerrainProjectLayerBlend terrainProjectEvaluateSeedFixedLayerBlend(vec2 worldXZ) {
      float totalWeight;
      vec4 weights = terrainProjectSampleSeedFixedLayerWeights(worldXZ, totalWeight);
      vec3 layerColor1 = terrainProjectSeedFixedNonGrassColor(material_TerrainSeedLayerColor1.rgb);
      vec3 layerColor2 = terrainProjectSeedFixedNonGrassColor(material_TerrainSeedLayerColor2.rgb);
      TerrainProjectLayerBlend blend;
      blend.albedo = terrainProjectBlendGroundLayerColor(
        weights, vec3(1.0), layerColor1, layerColor2, material_TerrainRoadColor.rgb
      );
      blend.tangentNormal = vec3(0.0, 0.0, 1.0);
      blend.metallic = 0.0;
      blend.smoothness = 0.0;
      blend.ambientOcclusion = 1.0;
      blend.snowResponse = dot(weights, material_TerrainSeedLayerSnowResponse);
      blend.grassWeight = weights.r;
      blend.roadWeight = weights.a;
      blend.weight = totalWeight;
      return blend;
    }

    #ifdef MATERIAL_TERRAIN_SEED_FAR_COMPOSITE
    SurfaceData evaluateTerrainSeedFarCompositeSurface(Varyings varyings, vec3 geometryNormal) {
      float totalWeight;
      vec4 weights = terrainProjectSampleSeedFixedLayerWeights(varyings.positionWS.xz, totalWeight);
      float grassCoverage = weights.r;
      float roadCoverage = weights.a;
      vec3 grassColor = evaluateGrassFarBaseColor(varyings.positionWS.xz);
      vec3 terrainAlbedo = terrainProjectBlendGroundLayerColor(
        weights, grassColor,
        terrainProjectSeedFixedNonGrassColor(material_TerrainSeedLayerColor1.rgb),
        terrainProjectSeedFixedNonGrassColor(material_TerrainSeedLayerColor2.rgb),
        evaluateRoadFarBaseColor(varyings.positionWS.xz, material_TerrainRoadColor.rgb)
      );
      vec3 shadingNormal = geometryNormal;
      float surfaceReliefWeight = terrainProjectSurfaceReliefWeight(varyings.positionWS);
      if (surfaceReliefWeight > 0.0) {
        vec3 reliefNormal = terrainProjectSurfaceReliefNormal(varyings.positionWS, geometryNormal, grassCoverage);
        shadingNormal = normalize(mix(shadingNormal, reliefNormal, surfaceReliefWeight));
      }
      SurfaceData surfaceData = terrainProjectBuildSurfaceData(
        varyings,
        terrainAlbedo,
        shadingNormal,
        0.0,
        0.0,
        1.0
      );
      terrainProjectApplySurfaceClimate(
        surfaceData,
        geometryNormal,
        vec3(1.0, 1.0, dot(weights, material_TerrainSeedLayerSnowResponse))
      );
      return surfaceData;
    }
    #endif
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
    #ifdef MATERIAL_TERRAIN_GRASS_SHADING
      float surfaceReliefWeight = terrainProjectSurfaceReliefWeight(varyings.positionWS);
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
    #ifdef TERRAIN_PROJECT_WATER_LAYER
      terrainProjectApplySurfaceClimateWithWaterFilm(
        surfaceData,
        geometryNormal,
        vec3(1.0, 1.0, layerBlend.snowResponse),
        waterFilm
      );
    #else
      terrainProjectApplySurfaceClimate(surfaceData, geometryNormal, vec3(1.0, 1.0, layerBlend.snowResponse));
    #endif
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
  #ifdef TERRAIN_PROJECT_WATER_LAYER
    terrainProjectApplySurfaceClimateWithWaterFilm(
      surfaceData,
      geometryNormal,
      vec3(1.0),
      waterFilm
    );
  #else
    terrainProjectApplySurfaceClimate(surfaceData, geometryNormal, vec3(1.0));
  #endif
  return surfaceData;
}

#endif
