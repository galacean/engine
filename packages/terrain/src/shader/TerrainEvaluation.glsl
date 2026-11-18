#ifndef TERRAIN_PROJECT_TERRAIN_EVALUATION_INCLUDED
#define TERRAIN_PROJECT_TERRAIN_EVALUATION_INCLUDED

#include "terrain/TerrainSurfaceData.glsl"
#include "terrain/TerrainGroundBlend.glsl"

vec4 material_BaseColor;
float material_Metallic;
float material_Smoothness;

const float TERRAIN_PROJECT_MIN_ADDITIVE_GROUP_WEIGHT = 0.005;

#ifdef MATERIAL_TERRAIN_DETAIL_TRANSITION
  float material_TerrainFarLod;
  float terrainProjectFarDetailVisibility(Varyings varyings) {
    float transitionLod = material_TerrainFarLod - 1.0;
    if (renderer_Lod < transitionLod - 0.5) return 1.0;
    if (renderer_Lod < transitionLod + 0.5) return 1.0 - varyings.clipmapMorph;
    return 0.0;
  }
#endif

#ifdef MATERIAL_TERRAIN_LAYERS
  #include "terrain/TerrainLayerEvaluation.glsl"
  #if defined(MATERIAL_TERRAIN_MICRO_NORMAL) && !defined(MATERIAL_TERRAIN_FAR)
    sampler2D material_TerrainMicroNormal;
    vec3 material_TerrainSandMicroParams;
    vec3 terrainProjectAddMicroNormal(vec3 normalTS, vec3 positionWS, float lodWeight) {
      float distanceLimit = material_TerrainSandMicroParams.z;
      vec2 uv = positionWS.xz * material_TerrainSandMicroParams.y;
      vec2 dx = dFdx(uv), dy = dFdy(uv);
      vec2 texels = vec2(textureSize(material_TerrainMicroNormal, 0));
      float footprint = max(length(dx * texels), length(dy * texels));
      float weight = lodWeight * (1.0 - smoothstep(1.25, 6.0, footprint)) *
        (1.0 - smoothstep(distanceLimit / 3.0, distanceLimit, distance(positionWS, camera_Position)));
      weight *= material_TerrainSandMicroParams.x;
      if (weight <= 0.0) return normalTS;
      vec3 detail = textureGrad(material_TerrainMicroNormal, uv, dx, dy).rgb * 2.0 - 1.0;
      normalTS.xy += detail.xy / max(detail.z, 0.1) * normalTS.z * weight;
      return normalTS;
    }
  #endif
  SurfaceData evaluateTerrainLayerSurface(
    Varyings varyings,
    vec3 geometryNormal,
    TerrainProjectLayerBlend layerBlend
  ) {
    vec3 terrainAlbedo = terrainProjectGroundColor(layerBlend, varyings.positionWS);
    vec3 tangentNormal = layerBlend.tangentNormal;
    #ifndef MATERIAL_TERRAIN_FAR
      float detailVisibility = 1.0;
      #ifdef MATERIAL_TERRAIN_DETAIL_TRANSITION
        detailVisibility = terrainProjectFarDetailVisibility(varyings);
      #endif
      #ifdef MATERIAL_TERRAIN_SAND_RIPPLE
        float fadeEnd = material_TerrainSandRippleParams.z;
        float rippleWeight = detailVisibility *
          (1.0 - smoothstep(fadeEnd * (35.0 / 115.0), fadeEnd, distance(varyings.positionWS, camera_Position)));
        tangentNormal = mix(vec3(0.0, 0.0, 1.0), tangentNormal, rippleWeight);
      #endif
      #ifdef MATERIAL_TERRAIN_MICRO_NORMAL
        tangentNormal = terrainProjectAddMicroNormal(tangentNormal, varyings.positionWS, detailVisibility);
      #endif
    #endif
    vec3 shadingNormal = terrainProjectLayerNormalToWorld(tangentNormal, geometryNormal);
    return terrainProjectBuildSurfaceData(
      varyings,
      terrainAlbedo,
      shadingNormal,
      layerBlend.metallic,
      layerBlend.smoothness,
      layerBlend.ambientOcclusion
    );
  }
#endif

SurfaceData evaluateTerrainFallbackSurface(
  Varyings varyings,
  vec3 geometryNormal
) {
  return terrainProjectBuildSurfaceData(
    varyings,
    material_BaseColor.rgb,
    geometryNormal,
    material_Metallic,
    material_Smoothness,
    1.0
  );
}

#endif
