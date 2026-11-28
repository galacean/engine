#ifndef TERRAIN_PROJECT_TERRAIN_DEPTH_SHADOW_PASS_INCLUDED
#define TERRAIN_PROJECT_TERRAIN_DEPTH_SHADOW_PASS_INCLUDED

#include "ShaderLibrary/Common/Common.glsl"
#include "ShaderLibrary/Common/Transform.glsl"
#include "ShaderLibrary/Common/Attributes.glsl"
#include "terrain/TerrainHeight.glsl"
#include "shared/EntranceWave.glsl"
#ifdef TERRAIN_PROJECT_SHADOW_CASTER_PASS
  #include "shared/Shadow.glsl"
#endif

struct TerrainDepthShadowVaryings {
  vec2 sourceXZ;
  vec3 sourcePositionWS;
  float terrainValid;
  #ifdef TERRAIN_PROJECT_ENTRANCE_WAVE
    float entranceSourceY;
  #endif
};

TerrainDepthShadowVaryings terrainProjectBuildDepthShadowVaryings(Attributes attributes) {
  TerrainDepthShadowVaryings varyings;
  TerrainProjectClipmapVertex clipmapVertex = terrainProjectClipmapVertexAt(attributes.POSITION);
  varyings.sourceXZ = clipmapVertex.sourceXZ;
  varyings.sourcePositionWS = clipmapVertex.positionWS;
  varyings.terrainValid = clipmapVertex.valid;
  #ifdef TERRAIN_PROJECT_ENTRANCE_WAVE
    varyings.entranceSourceY = clipmapVertex.positionWS.y;
  #endif
  vec3 positionWS = clipmapVertex.positionWS;
  #ifdef TERRAIN_PROJECT_ENTRANCE_WAVE
    positionWS = terrainProjectApplyEntranceWavePosition(positionWS);
    positionWS = terrainProjectApplyEntranceWaveHeightPosition(positionWS, varyings.entranceSourceY);
  #endif
  #ifdef TERRAIN_PROJECT_SHADOW_CASTER_PASS
    vec3 normalWS = terrainProjectClipmapGeometryNormal(clipmapVertex);
    gl_Position = terrainProjectShadowClipPosition(applyTerrainProjectShadowBias(positionWS, normalWS));
  #else
    gl_Position = camera_VPMat * vec4(positionWS, 1.0);
  #endif
  return varyings;
}

void terrainProjectDiscardInvalidDepthShadow(TerrainDepthShadowVaryings varyings) {
  if (varyings.terrainValid < 0.999) discard;
  #ifdef TERRAIN_PROJECT_ENTRANCE_WAVE
    if (
      terrainProjectEntranceWaveReveal(varyings.sourcePositionWS) <= 0.001 ||
      terrainProjectEntranceWaveHeightReveal(varyings.entranceSourceY) <= 0.001
    ) discard;
  #endif
}

#ifdef TERRAIN_PROJECT_SHADOW_CASTER_PASS
  TerrainDepthShadowVaryings TerrainShadowVertex(Attributes attributes) {
    return terrainProjectBuildDepthShadowVaryings(attributes);
  }

  void TerrainShadowFragment(TerrainDepthShadowVaryings varyings) {
    terrainProjectDiscardInvalidDepthShadow(varyings);
    gl_FragColor = terrainProjectShadowColor();
  }
#else
  TerrainDepthShadowVaryings TerrainDepthOnlyVertex(Attributes attributes) {
    return terrainProjectBuildDepthShadowVaryings(attributes);
  }

  void TerrainDepthOnlyFragment(TerrainDepthShadowVaryings varyings) {
    terrainProjectDiscardInvalidDepthShadow(varyings);
  }
#endif

#endif
