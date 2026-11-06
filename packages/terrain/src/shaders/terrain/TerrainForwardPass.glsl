#include "shared/WorldSelection.glsl"
#ifdef RENDERER_WORLD_PICK
float renderer_WorldPickBase;
#endif
#ifndef TERRAIN_PROJECT_TERRAIN_FORWARD_PASS_INCLUDED
#define TERRAIN_PROJECT_TERRAIN_FORWARD_PASS_INCLUDED

#define TERRAIN_PROJECT_FORWARD_PASS
#include "ShaderLibrary/Common/Common.glsl"
#include "ShaderLibrary/Common/Transform.glsl"
#include "ShaderLibrary/Common/Attributes.glsl"
#include "ShaderLibrary/Shadow/Shadow.glsl"

#ifndef MATERIAL_TERRAIN_FAR
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

  gl_Position = varyings.positionCS;
  return varyings;
}

void TerrainFragment(Varyings varyings) {
  #ifdef TERRAIN_PROJECT_GROUND_SHADOW_PCF
    // Derivatives must precede discards and per-pixel layer/water-film branches.
    vec3 shadowPositionDx = dFdx(varyings.positionWS);
    vec3 shadowPositionDy = dFdy(varyings.positionWS);
  #endif
  if (varyings.terrainValid < 0.999 || terrainProjectSolidAt(varyings.sourceXZ) < 0.5) discard;
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
  vec3 geometryNormal = normalize(varyings.normalWS);
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
      TerrainProjectLightingResult lighting = terrainProjectCreateLightingResult();
      #ifdef TERRAIN_PROJECT_WATER_LAYER
        TerrainProjectWaterFilmAccumulator waterFilmAccumulator = terrainProjectCreateWaterFilmAccumulator();
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
              layerBlend
              #ifdef TERRAIN_PROJECT_WATER_LAYER
                , waterFilm
              #endif
            );
            if (!hasSurface) {
              #ifdef TERRAIN_PROJECT_WATER_LAYER
                waterFilmSubstrate = surfaceData;
              #endif
              hasSurface = true;
            }
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
    color = fog(vec4(color, 1.0), varyings.positionVS).rgb;
  #endif
  gl_FragColor = worldSelectionColor(vec4(color, 1.0), worldSelectionRegionWeight(varyings.positionWS.xz));
  #endif
}

#endif
