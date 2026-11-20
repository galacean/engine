#ifndef TERRAIN_PROJECT_SSR_RECEIVER_PASS_INCLUDED
#define TERRAIN_PROJECT_SSR_RECEIVER_PASS_INCLUDED

#include "ShaderLibrary/Common/Common.glsl"
#include "ShaderLibrary/Common/Transform.glsl"
#include "ShaderLibrary/Common/Attributes.glsl"

#ifndef TERRAIN_PROJECT_WATER_LAYER
  #define TERRAIN_PROJECT_WATER_LAYER
#endif
#ifndef TERRAIN_PROJECT_PUDDLE_HYDROLOGY
  #define TERRAIN_PROJECT_PUDDLE_HYDROLOGY
#endif

struct Varyings {
  vec3 positionWS;
  vec2 sourceXZ;
  #ifdef TERRAIN_PROJECT_ENTRANCE_WAVE
    float entranceSourceY;
  #endif
  vec3 normalWS;
  vec4 positionCS;
  float terrainValid;
  float clipmapMorph;
};

#include "ShaderLibrary/PBR/BSDF.glsl"
#include "ShaderLibrary/Lighting/ScreenSpaceReflection/ScreenSpaceReflectionCommon.glsl"
#include "terrain/TerrainHeight.glsl"
#include "terrain/TerrainEvaluation.glsl"
#include "shared/EntranceWave.glsl"

float material_ScreenSpaceReflectionIntensity;
vec4 camera_SSRParams;

struct TerrainProjectSSRReceiverOutput {
  layout(location = 0) vec4 normalRoughness;
  layout(location = 1) vec4 receiverDepth;
};

Varyings TerrainSSRReceiverVertex(Attributes attributes) {
  Varyings varyings;
  TerrainProjectClipmapVertex clipmapVertex = terrainProjectClipmapVertexAt(attributes.POSITION);
  varyings.positionWS = clipmapVertex.positionWS;
  varyings.sourceXZ = clipmapVertex.sourceXZ;
  varyings.terrainValid = clipmapVertex.valid;
  varyings.clipmapMorph = clipmapVertex.morph;
  varyings.normalWS = terrainProjectClipmapGeometryNormal(clipmapVertex);
  #ifdef TERRAIN_PROJECT_ENTRANCE_WAVE
    varyings.entranceSourceY = clipmapVertex.positionWS.y;
    varyings.positionWS = terrainProjectApplyEntranceWavePosition(varyings.positionWS);
    varyings.positionWS = terrainProjectApplyEntranceWaveHeightPosition(
      varyings.positionWS,
      varyings.entranceSourceY
    );
  #endif
  varyings.positionCS = camera_VPMat * vec4(varyings.positionWS, 1.0);
  gl_Position = varyings.positionCS;
  return varyings;
}

TerrainProjectWaterFilm terrainProjectResolveSSRReceiverWaterFilm(
  Varyings varyings,
  vec3 geometryNormal,
  vec2 sandMicroSlope
) {
  TerrainProjectWaterFilm waterFilm;
  bool hasResolvedLayers = false;
  #ifdef MATERIAL_TERRAIN_LAYERS
    int regionIndex;
    int alphamapOffset;
    int alphamapCount;
    if (terrainProjectResolveLayerGroups(
      varyings.positionWS.xz,
      regionIndex,
      alphamapOffset,
      alphamapCount
    )) {
      TerrainProjectWaterFilmAccumulator waterFilmAccumulator = terrainProjectCreateWaterFilmAccumulator();
      SurfaceData firstSubstrate;
      float totalWeight = 0.0;
      for (int groupIndex = 0; groupIndex < TERRAIN_PROJECT_MAX_ALPHAMAPS_PER_REGION; groupIndex++) {
        if (groupIndex >= alphamapCount) break;
        TerrainProjectLayerBlend layerBlend;
        if (terrainProjectEvaluateLayerGroup(
          varyings.positionWS,
          regionIndex,
          alphamapOffset + groupIndex,
          layerBlend
        )) {
          float groupWeight = layerBlend.weight;
          if (groupWeight > 0.0 && (groupIndex == 0 || groupWeight > TERRAIN_PROJECT_MIN_ADDITIVE_GROUP_WEIGHT)) {
            TerrainProjectWaterFilm candidateWaterFilm;
            SurfaceData candidate = evaluateTerrainLayerWaterFilm(
              varyings,
              geometryNormal,
              layerBlend,
              sandMicroSlope,
              candidateWaterFilm
            );
            if (totalWeight <= 0.0) firstSubstrate = candidate;
            terrainProjectAccumulateWaterFilm(waterFilmAccumulator, candidateWaterFilm, groupWeight);
            totalWeight += groupWeight;
          }
        }
      }
      if (totalWeight > 0.0) {
        waterFilm = terrainProjectResolveWaterFilm(
          waterFilmAccumulator,
          geometryNormal,
          firstSubstrate.viewDir,
          firstSubstrate.ambientOcclusion
        );
        hasResolvedLayers = true;
      }
    }
  #endif
  if (!hasResolvedLayers) {
    evaluateTerrainFallbackWaterFilm(varyings, geometryNormal, waterFilm);
  }
  return waterFilm;
}

TerrainProjectSSRReceiverOutput TerrainSSRReceiverFragment(Varyings varyings) {
  TerrainProjectSSRReceiverOutput output;
  output.normalRoughness = vec4(0.0);
  output.receiverDepth = vec4(0.0);
  #ifdef MATERIAL_TERRAIN_FAR
    // Keep discard syntactically conditional on a runtime varying so older ANGLE/Adreno
    // translators cannot prune the trailing `return output;` from this non-void function.
    if (!(varyings.terrainValid > 2.0)) {
      discard;
    }
    return output;
  #else
    if (material_ScreenSpaceReflectionIntensity <= 0.0) {
      discard;
    }
    // Evaluate sand micro-detail derivatives before non-uniform fragment discards.
    vec2 sandMicroSlope = vec2(0.0);
    #ifdef MATERIAL_TERRAIN_LAYERS
      sandMicroSlope = terrainProjectSandMicroDetail(varyings).slope;
    #endif
    if (varyings.terrainValid < 0.999) {
      discard;
    }
    #ifdef TERRAIN_PROJECT_ENTRANCE_WAVE
      if (
        terrainProjectEntranceWaveReveal(varyings.positionWS) <= 0.001 ||
        terrainProjectEntranceWaveHeightReveal(varyings.entranceSourceY) <= 0.001
      ) {
        discard;
      }
    #endif

    vec3 geometryNormal = terrainProjectShadingGeometryNormal(varyings.positionWS.xz, varyings.normalWS);
    TerrainProjectWaterFilm waterFilm = terrainProjectResolveSSRReceiverWaterFilm(
      varyings,
      geometryNormal,
      sandMicroSlope
    );
    if (waterFilm.coverage <= 0.005) {
      discard;
    }

    float waterRoughness = clamp(waterFilm.roughness, MIN_PERCEPTUAL_ROUGHNESS, 1.0);
    if (waterRoughness >= camera_SSRParams.y) {
      discard;
    }

    float eyeDepth = remapDepthBufferEyeDepth(gl_FragCoord.z);
    output.normalRoughness = packSSRNormalRoughness(waterFilm.normal, waterRoughness);
    output.receiverDepth = encodeSSRDepth(eyeDepth, camera_ProjectionParams.z);
    return output;
  #endif
}

#endif
