#ifdef RENDERER_WORLD_PICK
float renderer_WorldPickBase;
#endif
#ifndef TERRAIN_PROJECT_TERRAIN_FORWARD_PASS_INCLUDED
#define TERRAIN_PROJECT_TERRAIN_FORWARD_PASS_INCLUDED

#define TERRAIN_PROJECT_FORWARD_PASS
#if !defined(RENDERER_WORLD_PICK) && !defined(MATERIAL_TERRAIN_FAR)
  #define TERRAIN_PROJECT_VERTEX_CLOUD_SHADOW
#endif
#if SCENE_FOG_MODE != 0 && defined(SCENE_FOG_DIRECTIONAL_SKY) && !defined(RENDERER_WORLD_PICK) && !defined(MATERIAL_TERRAIN_FAR)
  #define TERRAIN_PROJECT_VERTEX_FOG_RADIANCE
#endif
#if defined(MATERIAL_TERRAIN_SAND_GLINTS) && defined(MATERIAL_TERRAIN_MICRO_NORMAL) && defined(MATERIAL_TERRAIN_LAYERS) && defined(SCENE_DIRECT_LIGHT_COUNT) && !defined(MATERIAL_TERRAIN_FAR) && !defined(RENDERER_WORLD_PICK)
  #define TERRAIN_PROJECT_SAND_GLINTS
#endif
#include "ShaderLibrary/Common/Common.glsl"
#include "ShaderLibrary/Common/Transform.glsl"
#include "ShaderLibrary/Common/Attributes.glsl"
#include "ShaderLibrary/Shadow/Shadow.glsl"

#if !defined(MATERIAL_TERRAIN_FAR) && !defined(SCENE_SURFACE_CLIMATE_DRY)
  #ifndef TERRAIN_PROJECT_WATER_LAYER
    #define TERRAIN_PROJECT_WATER_LAYER
  #endif
  #ifndef TERRAIN_PROJECT_PUDDLE_HYDROLOGY
    #define TERRAIN_PROJECT_PUDDLE_HYDROLOGY
  #endif
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
  #if SCENE_FOG_MODE != 0
    vec3 positionVS;
    #ifdef TERRAIN_PROJECT_VERTEX_FOG_RADIANCE
      vec3 fogRadiance;
    #endif
  #endif
  #ifdef TERRAIN_PROJECT_VERTEX_CLOUD_SHADOW
    float cloudShadow;
  #endif
  #if defined(SCENE_USE_PROBE_VOLUME) && defined(SCENE_PROBE_VOLUME_PER_VERTEX)
    vec3 probeIrradiance;
    float probeWeight;
  #endif
  #if defined(NEED_CALCULATE_SHADOWS) && (SCENE_SHADOW_CASCADED_COUNT == 1)
    vec3 shadowCoord;
  #endif
};

#include "ShaderLibrary/PBR/BSDF.glsl"
#include "ShaderLibrary/Common/Fog.glsl"
#include "terrain/TerrainHeight.glsl"
#include "terrain/TerrainEvaluation.glsl"
#include "shared/Lighting.glsl"
#include "shared/EntranceWave.glsl"
#ifdef TERRAIN_PROJECT_SAND_GLINTS
  #include "terrain/TerrainSandGlints.glsl"
#endif

Varyings TerrainVertex(Attributes attributes) {
  Varyings varyings;
  TerrainProjectClipmapVertex clipmapVertex = terrainProjectClipmapVertexAt(attributes.POSITION);
  varyings.positionWS = clipmapVertex.positionWS;
  #ifdef TERRAIN_PROJECT_ENTRANCE_WAVE
    varyings.entranceSourceY = clipmapVertex.positionWS.y;
  #endif
  #ifdef TERRAIN_PROJECT_ENTRANCE_WAVE
    varyings.positionWS = terrainProjectApplyEntranceWavePosition(varyings.positionWS);
    varyings.positionWS = terrainProjectApplyEntranceWaveHeightPosition(
      varyings.positionWS,
      varyings.entranceSourceY
    );
  #endif
  varyings.sourceXZ = clipmapVertex.sourceXZ;
  varyings.terrainValid = clipmapVertex.valid;
  varyings.clipmapMorph = clipmapVertex.morph;
  varyings.normalWS = terrainProjectClipmapGeometryNormal(clipmapVertex);
  varyings.positionCS = camera_VPMat * vec4(varyings.positionWS, 1.0);

  #if SCENE_FOG_MODE != 0
    varyings.positionVS = (camera_ViewMat * vec4(varyings.positionWS, 1.0)).xyz;
    #ifdef TERRAIN_PROJECT_VERTEX_FOG_RADIANCE
      varyings.fogRadiance = clipmapVertex.valid < 0.999 ? vec3(0.0) : getFogSkyRadiance(varyings.positionVS);
    #endif
  #endif
  #ifdef TERRAIN_PROJECT_VERTEX_CLOUD_SHADOW
    varyings.cloudShadow = clipmapVertex.valid < 0.999 ? 1.0 : sampleVolumetricCloudShadow(varyings.positionWS);
  #endif
  #if defined(SCENE_USE_PROBE_VOLUME) && defined(SCENE_PROBE_VOLUME_PER_VERTEX)
    vec3 probeIrradiance;
    bool hasProbe = sampleProbeVolume(
      varyings.positionWS,
      varyings.normalWS,
      normalize(camera_Position - varyings.positionWS),
      probeIrradiance
    );
    varyings.probeIrradiance = probeIrradiance;
    varyings.probeWeight = hasProbe ? 1.0 : 0.0;
  #endif
  #if defined(NEED_CALCULATE_SHADOWS) && (SCENE_SHADOW_CASCADED_COUNT == 1)
    varyings.shadowCoord = getShadowCoord(varyings.positionWS);
  #endif

  // Cull invalid clipmap vertices in the vertex stage so TerrainFragment stays
  // discard-free and preserves Apple TBDR Early-Z / Hidden Surface Removal (HSR).
  if (clipmapVertex.valid < 0.999) {
    float zeroVal = clipmapVertex.valid * 0.0;
    gl_Position = vec4(zeroVal / zeroVal);
  } else {
    gl_Position = varyings.positionCS;
  }
  return varyings;
}

void TerrainFragment(Varyings varyings) {
  #ifdef TERRAIN_PROJECT_SAND_GLINTS
    vec2 glintDx = dFdx(varyings.positionWS.xz);
    vec2 glintDy = dFdy(varyings.positionWS.xz);
  #endif
  #ifdef TERRAIN_PROJECT_GROUND_SHADOW_PCF
    // Derivatives must precede discards and per-pixel layer/water-film branches.
    vec3 shadowPositionDx = dFdx(varyings.positionWS);
    vec3 shadowPositionDy = dFdy(varyings.positionWS);
  #endif
  #ifdef TERRAIN_PROJECT_ENTRANCE_WAVE
    if (
      terrainProjectEntranceWaveReveal(varyings.positionWS) <= 0.001 ||
      terrainProjectEntranceWaveHeightReveal(varyings.entranceSourceY) <= 0.001
    ) discard;
  #endif
  #ifdef RENDERER_WORLD_PICK
    float id = floor(renderer_WorldPickBase + 0.5);
    #ifdef RENDERER_WORLD_PICK_DEPTH
      id = floor(gl_FragCoord.z * 16777215.0 + 0.5);
    #endif
    gl_FragColor = vec4(mod(id, 256.0), mod(floor(id / 256.0), 256.0), floor(id / 65536.0), 255.0) / 255.0;
  #else
  #ifdef TERRAIN_PROJECT_GROUND_SHADOW_PCF
    float shadowAttenuation = sampleTerrainProjectGroundShadow(varyings, shadowPositionDx, shadowPositionDy);
  #else
    float shadowAttenuation = sampleTerrainProjectShadow(varyings);
  #endif
  #ifdef TERRAIN_PROJECT_VERTEX_CLOUD_SHADOW
    shadowAttenuation *= varyings.cloudShadow;
  #endif
  vec3 geometryNormal = terrainProjectShadingGeometryNormal(varyings.positionWS.xz, varyings.normalWS);
  vec3 color = vec3(0.0);
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
      TerrainProjectSandMicroDetail microDetail = terrainProjectSandMicroDetail(varyings);
      #ifdef MATERIAL_TERRAIN_SINGLE_ALPHAMAP
        TerrainProjectLayerBlend layerBlend;
        if (terrainProjectEvaluateLayerGroup(
          varyings.positionWS,
          regionIndex,
          alphamapOffset,
          layerBlend
        ) && layerBlend.weight > 0.0) {
          float groupWeight = layerBlend.weight;
          #ifdef TERRAIN_PROJECT_WATER_LAYER
            TerrainProjectWaterFilm waterFilm;
          #endif
          SurfaceData surfaceData = evaluateTerrainLayerSurface(
            varyings,
            geometryNormal,
            layerBlend,
            microDetail.slope
            #ifdef TERRAIN_PROJECT_WATER_LAYER
              , waterFilm
            #endif
          );
          TerrainProjectLightingResult lighting = terrainProjectCreateLightingResult();
          terrainProjectAccumulateLighting(
            lighting,
            evaluateTerrainProjectLightingWithShadow(varyings, surfaceData, shadowAttenuation),
            groupWeight
          );
          #ifdef TERRAIN_PROJECT_SAND_GLINTS
            float exposedSand = layerBlend.sandWeight * groupWeight;
            #ifndef SCENE_SURFACE_CLIMATE_DRY
              exposedSand *= 1.0 - clamp(scene_SurfaceClimate.z * layerBlend.snowResponse, 0.0, 1.0);
            #endif
            #ifdef TERRAIN_PROJECT_WATER_LAYER
              exposedSand *= 1.0 - waterFilm.coverage;
            #endif
            terrainProjectApplySandGrains(lighting, varyings.positionWS, surfaceData.viewDir, surfaceData.normal * exposedSand, microDetail,
              glintDx, glintDy, exposedSand, shadowAttenuation);
          #endif
          #ifdef TERRAIN_PROJECT_WATER_LAYER
            waterFilm.coverage = clamp(waterFilm.coverage * groupWeight, 0.0, 1.0);
            if (waterFilm.coverage > 1e-5) {
              terrainProjectApplyWaterFilmLighting(varyings, surfaceData, waterFilm, lighting);
            }
          #endif
          color = terrainProjectFinalLighting(lighting);
        }
      #else
        TerrainProjectLightingResult lighting = terrainProjectCreateLightingResult();
        #ifdef TERRAIN_PROJECT_SAND_GLINTS
          float sandCoverage = 0.0;
          vec3 sandNormalSum = vec3(0.0);
        #endif
        #ifdef TERRAIN_PROJECT_WATER_LAYER
          TerrainProjectWaterFilmAccumulator waterFilmAccumulator = terrainProjectCreateWaterFilmAccumulator();
        #endif
        #if defined(TERRAIN_PROJECT_WATER_LAYER) || defined(TERRAIN_PROJECT_SAND_GLINTS)
          SurfaceData waterFilmSubstrate;
        #endif
        bool hasSurface = false;
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
              #ifdef TERRAIN_PROJECT_WATER_LAYER
                TerrainProjectWaterFilm waterFilm;
              #endif
              SurfaceData surfaceData = evaluateTerrainLayerSurface(
                varyings,
                geometryNormal,
                layerBlend,
                microDetail.slope
                #ifdef TERRAIN_PROJECT_WATER_LAYER
                  , waterFilm
                #endif
              );
              if (!hasSurface) {
                #if defined(TERRAIN_PROJECT_WATER_LAYER) || defined(TERRAIN_PROJECT_SAND_GLINTS)
                  waterFilmSubstrate = surfaceData;
                #endif
                hasSurface = true;
              }
              #ifdef TERRAIN_PROJECT_SAND_GLINTS
                float exposedSand = layerBlend.sandWeight * groupWeight;
                #ifndef SCENE_SURFACE_CLIMATE_DRY
                  exposedSand *= 1.0 - clamp(scene_SurfaceClimate.z * layerBlend.snowResponse, 0.0, 1.0);
                #endif
                #ifdef TERRAIN_PROJECT_WATER_LAYER
                  exposedSand *= 1.0 - waterFilm.coverage;
                #endif
                sandCoverage += exposedSand;
                sandNormalSum += surfaceData.normal * exposedSand;
              #endif
              terrainProjectAccumulateLighting(
                lighting,
                evaluateTerrainProjectLightingWithShadow(varyings, surfaceData, shadowAttenuation),
                groupWeight
              );
              #ifdef TERRAIN_PROJECT_WATER_LAYER
                terrainProjectAccumulateWaterFilm(waterFilmAccumulator, waterFilm, groupWeight);
              #endif
            }
          }
        }
        if (hasSurface) {
          #ifdef TERRAIN_PROJECT_SAND_GLINTS
            terrainProjectApplySandGrains(lighting, varyings.positionWS, waterFilmSubstrate.viewDir, sandNormalSum, microDetail,
              glintDx, glintDy, sandCoverage, shadowAttenuation);
          #endif
          #ifdef TERRAIN_PROJECT_WATER_LAYER
            TerrainProjectWaterFilm waterFilm = terrainProjectResolveWaterFilm(
              waterFilmAccumulator,
              geometryNormal,
              waterFilmSubstrate.viewDir,
              waterFilmSubstrate.ambientOcclusion
            );
            terrainProjectApplyWaterFilmLighting(varyings, waterFilmSubstrate, waterFilm, lighting);
          #endif
          color = terrainProjectFinalLighting(lighting);
        }
      #endif
    } else {
      #ifdef TERRAIN_PROJECT_WATER_LAYER
        TerrainProjectWaterFilm waterFilm;
      #endif
      SurfaceData surfaceData = evaluateTerrainFallbackSurface(varyings, geometryNormal
        #ifdef TERRAIN_PROJECT_WATER_LAYER
          , waterFilm
        #endif
      );
      TerrainProjectLightingResult lighting = evaluateTerrainProjectLightingWithShadow(varyings, surfaceData, shadowAttenuation);
      #ifdef TERRAIN_PROJECT_WATER_LAYER
        terrainProjectApplyWaterFilmLighting(varyings, surfaceData, waterFilm, lighting);
      #endif
      color = terrainProjectFinalLighting(lighting);
    }
  #else
    #ifdef TERRAIN_PROJECT_WATER_LAYER
      TerrainProjectWaterFilm waterFilm;
    #endif
    SurfaceData surfaceData = evaluateTerrainFallbackSurface(varyings, geometryNormal
      #ifdef TERRAIN_PROJECT_WATER_LAYER
        , waterFilm
      #endif
    );
    TerrainProjectLightingResult lighting = evaluateTerrainProjectLightingWithShadow(varyings, surfaceData, shadowAttenuation);
    #ifdef TERRAIN_PROJECT_WATER_LAYER
      terrainProjectApplyWaterFilmLighting(varyings, surfaceData, waterFilm, lighting);
    #endif
    color = terrainProjectFinalLighting(lighting);
  #endif
  #ifdef TERRAIN_PROJECT_ENTRANCE_WAVE
    color = applyTerrainProjectEntranceWave(color, varyings.positionWS);
  #endif
  #if SCENE_FOG_MODE != 0
    #ifdef TERRAIN_PROJECT_VERTEX_FOG_RADIANCE
      color = mix(varyings.fogRadiance, color, getSceneFogVisibility(varyings.positionVS));
    #else
      color = fog(vec4(color, 1.0), varyings.positionVS).rgb;
    #endif
  #endif
  gl_FragColor = vec4(color, 1.0);
  #endif
}

#endif
