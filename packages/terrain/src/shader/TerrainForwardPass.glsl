#ifndef TERRAIN_PROJECT_TERRAIN_FORWARD_PASS_INCLUDED
#define TERRAIN_PROJECT_TERRAIN_FORWARD_PASS_INCLUDED

#define TERRAIN_PROJECT_FORWARD_PASS
#include "ShaderLibrary/Common/Common.glsl"
#include "ShaderLibrary/Common/Transform.glsl"
#include "ShaderLibrary/Common/Attributes.glsl"
#include "ShaderLibrary/Shadow/Shadow.glsl"

struct Varyings {
  vec3 positionWS;
  vec2 sourceXZ;
  vec3 normalWS;
  vec4 positionCS;
  float terrainValid;
  float clipmapMorph;
  #if SCENE_FOG_MODE != 0
    vec3 positionVS;
  #endif
  #if defined(NEED_CALCULATE_SHADOWS) && (SCENE_SHADOW_CASCADED_COUNT == 1)
    vec3 shadowCoord;
  #endif
};

#include "ShaderLibrary/PBR/BSDF.glsl"
#include "ShaderLibrary/Common/Fog.glsl"
#include "terrain/TerrainHeight.glsl"
#include "terrain/TerrainEvaluation.glsl"
#include "terrain/TerrainLighting.glsl"

Varyings TerrainVertex(Attributes attributes) {
  Varyings varyings;
  TerrainProjectClipmapVertex clipmapVertex = terrainProjectClipmapVertexAt(attributes.POSITION);
  varyings.positionWS = clipmapVertex.positionWS;
  varyings.sourceXZ = clipmapVertex.sourceXZ;
  varyings.terrainValid = clipmapVertex.valid;
  varyings.clipmapMorph = clipmapVertex.morph;
  varyings.normalWS = terrainProjectClipmapGeometryNormal(clipmapVertex);
  varyings.positionCS = camera_VPMat * vec4(varyings.positionWS, 1.0);

  #if SCENE_FOG_MODE != 0
    varyings.positionVS = (camera_ViewMat * vec4(varyings.positionWS, 1.0)).xyz;
  #endif
  #if defined(NEED_CALCULATE_SHADOWS) && (SCENE_SHADOW_CASCADED_COUNT == 1)
    varyings.shadowCoord = getShadowCoord(varyings.positionWS);
  #endif

  gl_Position = varyings.positionCS;
  return varyings;
}

void TerrainFragment(Varyings varyings) {
  #ifdef TERRAIN_PROJECT_GROUND_SHADOW_PCF
    vec3 shadowPositionDx = dFdx(varyings.positionWS);
    vec3 shadowPositionDy = dFdy(varyings.positionWS);
  #endif
  if (varyings.terrainValid < 0.999) discard;

  #ifdef TERRAIN_PROJECT_GROUND_SHADOW_PCF
    float shadowAttenuation = sampleTerrainProjectGroundShadow(varyings, shadowPositionDx, shadowPositionDy);
  #else
    float shadowAttenuation = sampleTerrainProjectShadow(varyings);
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
      TerrainProjectLightingResult lighting = terrainProjectCreateLightingResult();
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
            SurfaceData surfaceData = evaluateTerrainLayerSurface(
              varyings,
              geometryNormal,
              layerBlend
            );
            hasSurface = true;
            terrainProjectAccumulateLighting(
              lighting,
              evaluateTerrainProjectLightingWithShadow(varyings, surfaceData, shadowAttenuation),
              groupWeight
            );
          }
        }
      }
      if (hasSurface) {
        color = terrainProjectFinalLighting(lighting);
      }
    } else {
      SurfaceData surfaceData = evaluateTerrainFallbackSurface(varyings, geometryNormal);
      TerrainProjectLightingResult lighting = evaluateTerrainProjectLightingWithShadow(varyings, surfaceData, shadowAttenuation);
      color = terrainProjectFinalLighting(lighting);
    }
  #else
    SurfaceData surfaceData = evaluateTerrainFallbackSurface(varyings, geometryNormal);
    TerrainProjectLightingResult lighting = evaluateTerrainProjectLightingWithShadow(varyings, surfaceData, shadowAttenuation);
    color = terrainProjectFinalLighting(lighting);
  #endif
  #if SCENE_FOG_MODE != 0
    color = fog(vec4(color, 1.0), varyings.positionVS).rgb;
  #endif
  gl_FragColor = vec4(color, 1.0);
}

#endif
