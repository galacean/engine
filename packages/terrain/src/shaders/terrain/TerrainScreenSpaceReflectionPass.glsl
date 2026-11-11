#ifndef TERRAIN_PROJECT_SCREEN_SPACE_REFLECTION_PASS_INCLUDED
#define TERRAIN_PROJECT_SCREEN_SPACE_REFLECTION_PASS_INCLUDED

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
  #if SCENE_FOG_MODE != 0
    vec3 positionVS;
  #endif
};

#include "ShaderLibrary/PBR/BSDF.glsl"
#include "ShaderLibrary/PBR/LightIndirectFunctions.glsl"
#include "ShaderLibrary/Common/Fog.glsl"
#include "ShaderLibrary/Lighting/ScreenSpaceReflection/ScreenSpaceReflection.glsl"
#include "terrain/TerrainHeight.glsl"
#include "terrain/TerrainEvaluation.glsl"
#include "shared/EntranceWave.glsl"

float material_ScreenSpaceReflectionMode;
float material_ScreenSpaceReflectionIntensity;

struct TerrainProjectScreenSpaceReflectionOutput {
  layout(location = 0) vec4 geometry;
  layout(location = 1) vec4 responseColor;
};

Varyings TerrainScreenSpaceReflectionVertex(Attributes attributes) {
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
  #if SCENE_FOG_MODE != 0
    varyings.positionVS = (camera_ViewMat * vec4(varyings.positionWS, 1.0)).xyz;
  #endif
  gl_Position = varyings.positionCS;
  return varyings;
}

float terrainProjectScreenSpaceReflectionFogVisibility(vec3 positionVS) {
  #if SCENE_FOG_MODE != 0
    return getSceneFogVisibility(positionVS);
  #else
    return 1.0;
  #endif
}

vec3 terrainProjectWaterScreenSpaceReflectionResponse(
  SurfaceData substrate,
  TerrainProjectWaterFilm waterFilm,
  out float waterRoughness
) {
  SurfaceData waterSurface = terrainProjectBuildWaterFilmSurface(substrate, waterFilm);
  BSDFData bsdfData;
  initBSDFData(waterSurface, bsdfData);
  waterRoughness = bsdfData.roughness;
  float specularAO = evaluateSpecularOcclusion(
    waterSurface.dotNV,
    bsdfData.diffuseAO,
    bsdfData.roughness
  );
  return specularAO * envBRDFApprox(
    bsdfData.resolvedSpecularF0,
    bsdfData.specularF90,
    bsdfData.roughness,
    waterSurface.dotNV
  ) * bsdfData.energyCompensation;
}

struct TerrainProjectScreenSpaceReflectionSurface {
  SurfaceData substrate;
  TerrainProjectWaterFilm waterFilm;
};

TerrainProjectScreenSpaceReflectionSurface terrainProjectResolveScreenSpaceReflectionSurface(
  Varyings varyings,
  vec3 geometryNormal
) {
  TerrainProjectScreenSpaceReflectionSurface resolved;
  resolved.substrate = evaluateTerrainFallbackSurface(varyings, geometryNormal, resolved.waterFilm);
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
            SurfaceData candidate = evaluateTerrainLayerSurface(
              varyings,
              geometryNormal,
              layerBlend,
              candidateWaterFilm
            );
            if (totalWeight <= 0.0) resolved.substrate = candidate;
            terrainProjectAccumulateWaterFilm(waterFilmAccumulator, candidateWaterFilm, groupWeight);
            totalWeight += groupWeight;
          }
        }
      }
      if (totalWeight > 0.0) {
        resolved.waterFilm = terrainProjectResolveWaterFilm(
          waterFilmAccumulator,
          geometryNormal,
          resolved.substrate.viewDir,
          resolved.substrate.ambientOcclusion
        );
      }
    }
  #endif
  return resolved;
}

TerrainProjectScreenSpaceReflectionOutput TerrainScreenSpaceReflectionFragment(Varyings varyings) {
  if (
    material_ScreenSpaceReflectionMode < 0.5 ||
    material_ScreenSpaceReflectionIntensity <= 0.0 ||
    varyings.terrainValid < 0.999 ||
    terrainProjectSolidAt(varyings.sourceXZ) < 0.5
  ) {
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
  #ifdef MATERIAL_TERRAIN_FAR
    discard;
  #endif

  vec3 geometryNormal = terrainProjectShadingGeometryNormal(varyings.positionWS.xz, varyings.normalWS);
  TerrainProjectScreenSpaceReflectionSurface resolved =
    terrainProjectResolveScreenSpaceReflectionSurface(varyings, geometryNormal);
  SurfaceData substrate = resolved.substrate;
  TerrainProjectWaterFilm waterFilm = resolved.waterFilm;
  float waterCoverage = waterFilm.coverage;
  if (waterCoverage <= 0.005) discard;

  float fogVisibility = 1.0;
  #if SCENE_FOG_MODE != 0
    fogVisibility = terrainProjectScreenSpaceReflectionFogVisibility(varyings.positionVS);
  #endif
  float waterRoughness;
  vec3 reflectionResponse = saturate(
    terrainProjectWaterScreenSpaceReflectionResponse(substrate, waterFilm, waterRoughness) *
      material_ScreenSpaceReflectionIntensity *
      fogVisibility
  ) * scene_TerrainWaterCoverageParams.z;

  vec3 viewNormal = normalize(mat3(camera_ViewMat) * waterFilm.normal);
  TerrainProjectScreenSpaceReflectionOutput output;
  output.geometry = packScreenSpaceReflectionSurface(viewNormal, waterRoughness, waterCoverage);
  output.responseColor = vec4(reflectionResponse, saturate(scene_TerrainWaterCoverageParams.w));
  return output;
}

#endif
