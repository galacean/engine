#ifndef TERRAIN_PROJECT_FOLIAGE_LIGHTING_INCLUDED
#define TERRAIN_PROJECT_FOLIAGE_LIGHTING_INCLUDED

// Dedicated diffuse-only lighting for Vegetation and Grass shaders.
// Deliberately avoids including engine PBR/BSDF/SSR/Specular-IBL/PointLight/SpotLight/Sheen/Clearcoat
// headers so foliage pays only for Lambert directional sun/moon lighting + simplified SH diffuse
// irradiance, while preserving day/night, shadows, cloud shadows, canopy cascade AO, snow, and seasons.
#include "ShaderLibrary/Lighting/Light.glsl"
#include "ShaderLibrary/Common/OilPaintBrush.glsl"
#include "shared/Shadow.glsl"

struct SurfaceData {
  vec3 albedoColor;
  vec3 emissiveColor;
  float metallic;
  float roughness;
  float ambientOcclusion;
  float opacity;
  float IOR;

  vec3 position;
  vec4 positionCS;
  vec3 normal;

  #ifdef NEED_TANGENT_SPACE
    vec3 tangent;
    vec3 bitangent;
  #endif

  vec3 viewDir;
  float dotNV;

  float specularIntensity;
  vec3 specularColor;
};

struct TerrainProjectLightingResult {
  vec3 directDiffuse;
  vec3 environmentDiffuse;
  #ifdef MATERIAL_ENABLE_TRANSLUCENCY
    vec3 backEnvironmentIrradiance;
  #endif
  float shadowAttenuation;
};

#ifndef TERRAIN_PROJECT_PREPARE_ALBEDO
  #define TERRAIN_PROJECT_PREPARE_ALBEDO(viewDirection, albedoColor, shadowAttenuation) albedoColor
#endif

// Simplified 9-band Spherical Harmonics diffuse irradiance (pre-scaled on CPU).
vec3 getLightProbeIrradiance(vec3 sh[9], vec3 normal) {
  vec3 result = sh[0] +
    sh[1] * normal.y +
    sh[2] * normal.z +
    sh[3] * normal.x +
    sh[4] * (normal.y * normal.x) +
    sh[5] * (normal.y * normal.z) +
    sh[6] * (3.0 * normal.z * normal.z - 1.0) +
    sh[7] * (normal.z * normal.x) +
    sh[8] * (normal.x * normal.x - normal.y * normal.y);
  return max(result, vec3(0.0));
}

vec3 getGlobalDiffuseIrradiance(vec3 normalWS) {
  #ifdef SCENE_USE_SH
    #ifdef SCENE_USE_REALTIME_SH
      return getRealtimeLightProbeIrradiance(normalWS);
    #else
      return getLightProbeIrradiance(scene_EnvSH, normalWS);
    #endif
  #else
    return scene_EnvMapLight.diffuse * PI;
  #endif
}

#ifdef MATERIAL_ENABLE_TRANSLUCENCY
// Single-pass dual 9-band SH evaluation for both +normalWS (front diffuse) and -normalWS
// (back translucency): L0+L2 terms are even functions of normal, L1 terms are odd.
void getGlobalDiffuseIrradianceDual(vec3 normalWS, out vec3 frontIrradiance, out vec3 backIrradiance) {
  #ifdef SCENE_USE_SH
    #ifdef SCENE_USE_REALTIME_SH
      vec3 evenTerms = scene_RealtimeEnvSH[0].xyz +
        scene_RealtimeEnvSH[4].xyz * (normalWS.y * normalWS.x) +
        scene_RealtimeEnvSH[5].xyz * (normalWS.y * normalWS.z) +
        scene_RealtimeEnvSH[6].xyz * (3.0 * normalWS.z * normalWS.z - 1.0) +
        scene_RealtimeEnvSH[7].xyz * (normalWS.z * normalWS.x) +
        scene_RealtimeEnvSH[8].xyz * (normalWS.x * normalWS.x - normalWS.y * normalWS.y);
      vec3 oddTerms =
        scene_RealtimeEnvSH[1].xyz * normalWS.y +
        scene_RealtimeEnvSH[2].xyz * normalWS.z +
        scene_RealtimeEnvSH[3].xyz * normalWS.x;
    #else
      vec3 evenTerms = scene_EnvSH[0] +
        scene_EnvSH[4] * (normalWS.y * normalWS.x) +
        scene_EnvSH[5] * (normalWS.y * normalWS.z) +
        scene_EnvSH[6] * (3.0 * normalWS.z * normalWS.z - 1.0) +
        scene_EnvSH[7] * (normalWS.z * normalWS.x) +
        scene_EnvSH[8] * (normalWS.x * normalWS.x - normalWS.y * normalWS.y);
      vec3 oddTerms =
        scene_EnvSH[1] * normalWS.y +
        scene_EnvSH[2] * normalWS.z +
        scene_EnvSH[3] * normalWS.x;
    #endif
    frontIrradiance = max(evenTerms + oddTerms, vec3(0.0));
    backIrradiance = max(evenTerms - oddTerms, vec3(0.0));
  #else
    vec3 fallbackIrradiance = scene_EnvMapLight.diffuse * PI;
    frontIrradiance = fallbackIrradiance;
    backIrradiance = fallbackIrradiance;
  #endif
}
#endif

#if (defined(RENDERER_PROCEDURAL_TREE_GPU_LEAF_FRAME) || defined(RENDERER_PROCEDURAL_PLANT_CANOPY_OCCLUSION)) && defined(MATERIAL_PROCEDURAL_TREE_CANOPY_OCCLUSION)
  #define TERRAIN_PROJECT_HAS_CANOPY_VISIBILITY
  float terrainProjectCanopyDirectVisibility(vec3 positionWS, float ambientOcclusion, float shadowAttenuation) {
    float canopyVisibility = clamp(ambientOcclusion, 0.0, 1.0);
    #ifdef NEED_CALCULATE_SHADOWS
      float weight = getShadowFade(positionWS);
      #if SCENE_SHADOW_CASCADED_COUNT > 1
        // Coarse tree casters lose leaf-scale detail. Introduce the bake over the outer
        // 15% of the nearest split sphere, and retain deeper shadows from other casters.
        vec4 nearSplit = scene_ShadowSplitSpheres[0];
        vec3 fromCenter = positionWS - nearSplit.xyz;
        float remainingRadiusSq = nearSplit.w - dot(fromCenter, fromCenter);
        float shellWidthSq = max(nearSplit.w * (1.0 - 0.85 * 0.85), 0.00001);
        weight = max(weight, 1.0 - smoothstep(0.0, shellWidthSq, remainingRadiusSq));
        return min(shadowAttenuation, mix(1.0, canopyVisibility, weight));
      #else
        return shadowAttenuation * mix(1.0, canopyVisibility, weight);
      #endif
    #else
      return canopyVisibility;
    #endif
  }
#endif

vec3 evaluateTerrainProjectFoliageDirectDiffuse(
  vec3 albedo,
  vec3 normalWS,
  float directShadowAttenuation
) {
  vec3 directDiffuse = vec3(0.0);
  #ifdef SCENE_DIRECT_LIGHT_COUNT
    for (int i = 0; i < SCENE_DIRECT_LIGHT_COUNT; i++) {
      if (!isRendererCulledByLight(renderer_Layer.xy, scene_DirectLightCullingMask[i])) {
        DirectLight directionalLight = getDirectLight(i);
        float atten = i == 0 ? directShadowAttenuation : 1.0;
        float dotNL = saturate(dot(normalWS, -directionalLight.direction));
        directDiffuse += (dotNL * atten) * directionalLight.color * albedo;
      }
    }
  #endif
  return directDiffuse;
}

vec3 evaluateTerrainProjectFoliageEnvironmentDiffuse(
  vec3 albedo,
  vec3 normalWS,
  float ambientOcclusion
) {
  vec3 irradiance = getGlobalDiffuseIrradiance(normalWS) * scene_EnvMapLight.diffuseIntensity;
  return ambientOcclusion * irradiance * (albedo * RECIPROCAL_PI);
}

TerrainProjectLightingResult evaluateTerrainProjectLightingWithShadow(
  Varyings varyings,
  SurfaceData surfaceData,
  float shadowAttenuation
) {
  TerrainProjectLightingResult result;
  result.directDiffuse = vec3(0.0);
  result.environmentDiffuse = vec3(0.0);
  #ifdef MATERIAL_ENABLE_TRANSLUCENCY
    result.backEnvironmentIrradiance = vec3(0.0);
  #endif
  result.shadowAttenuation = shadowAttenuation;

  surfaceData.albedoColor = TERRAIN_PROJECT_PREPARE_ALBEDO(
    surfaceData.viewDir,
    surfaceData.albedoColor,
    result.shadowAttenuation
  );
  #ifdef SCENE_OIL_PAINT_STYLE
    applyOilPaintBrushSurface(
      surfaceData.position,
      surfaceData.normal,
      0.42,
      0.80,
      surfaceData.albedoColor,
      surfaceData.normal,
      surfaceData.roughness
    );
  #endif

  float directShadowAttenuation = result.shadowAttenuation;
  #ifdef TERRAIN_PROJECT_HAS_CANOPY_VISIBILITY
    float canopyDirectVisibility = terrainProjectCanopyDirectVisibility(
      varyings.positionWS,
      surfaceData.ambientOcclusion,
      directShadowAttenuation
    );
    #ifdef NEED_CALCULATE_SHADOWS
      directShadowAttenuation = canopyDirectVisibility;
    #endif
  #endif

  result.directDiffuse = evaluateTerrainProjectFoliageDirectDiffuse(
    surfaceData.albedoColor,
    surfaceData.normal,
    directShadowAttenuation
  );
  #if defined(TERRAIN_PROJECT_HAS_CANOPY_VISIBILITY) && !defined(NEED_CALCULATE_SHADOWS)
    result.directDiffuse *= canopyDirectVisibility;
  #endif

  #ifdef MATERIAL_ENABLE_TRANSLUCENCY
    vec3 frontIrradiance;
    vec3 backIrradiance;
    getGlobalDiffuseIrradianceDual(surfaceData.normal, frontIrradiance, backIrradiance);
    float envScale = scene_EnvMapLight.diffuseIntensity * RECIPROCAL_PI;
    result.environmentDiffuse = surfaceData.ambientOcclusion * (frontIrradiance * envScale) * surfaceData.albedoColor;
    result.backEnvironmentIrradiance = backIrradiance * envScale;
  #else
    result.environmentDiffuse = evaluateTerrainProjectFoliageEnvironmentDiffuse(
      surfaceData.albedoColor,
      surfaceData.normal,
      surfaceData.ambientOcclusion
    );
  #endif
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
  result.environmentDiffuse = vec3(0.0);
  #ifdef MATERIAL_ENABLE_TRANSLUCENCY
    result.backEnvironmentIrradiance = vec3(0.0);
  #endif
  result.shadowAttenuation = 1.0;
  return result;
}

vec3 terrainProjectFinalLighting(TerrainProjectLightingResult result) {
  return result.directDiffuse + result.environmentDiffuse;
}

#endif
