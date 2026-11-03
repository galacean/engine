#ifndef TERRAIN_PROJECT_SHADOW_INCLUDED
#define TERRAIN_PROJECT_SHADOW_INCLUDED

#ifdef TERRAIN_PROJECT_FORWARD_PASS
#include "ShaderLibrary/Lighting/VolumetricCloudShadow.glsl"

#if defined(NEED_CALCULATE_SHADOWS) && (SCENE_SHADOW_TYPE == 2 || SCENE_SHADOW_TYPE == 3) && \
  (defined(TERRAIN_PROJECT_TERRAIN_FORWARD_PASS_INCLUDED) || defined(MATERIAL_FARM_GROUND_SURFACE))
  #define TERRAIN_PROJECT_GROUND_SHADOW_PCF

  mat4 terrainProjectGroundShadowMatrix(vec3 positionWS) {
    #if SCENE_SHADOW_CASCADED_COUNT == 1
      return scene_ShadowMatrices[0];
    #else
      int cascadeIndex = computeCascadeIndex(positionWS);
      #ifdef GRAPHICS_API_WEBGL2
        // Outside every split sphere, use the engine's zero-matrix sentinel.
        return scene_ShadowMatrices[min(cascadeIndex, SCENE_SHADOW_CASCADED_COUNT)];
      #else
        if (cascadeIndex == 0) return scene_ShadowMatrices[0];
        if (cascadeIndex == 1) return scene_ShadowMatrices[1];
        #if SCENE_SHADOW_CASCADED_COUNT == 4
          if (cascadeIndex == 2) return scene_ShadowMatrices[2];
          if (cascadeIndex == 3) return scene_ShadowMatrices[3];
        #endif
        return scene_ShadowMatrices[SCENE_SHADOW_CASCADED_COUNT];
      #endif
    #endif
  }

  // The comparison depth follows the receiving ground plane across the PCF footprint.
  // Reusing the centre depth cuts broad soft shadows into stationary straight bands on slopes.
  vec2 terrainProjectGroundShadowGradient(vec3 shadowDx, vec3 shadowDy) {
    float determinant = shadowDx.x * shadowDy.y - shadowDx.y * shadowDy.x;
    float derivativeScale = max(dot(shadowDx.xy, shadowDx.xy), dot(shadowDy.xy, shadowDy.xy));
    if (abs(determinant) <= max(derivativeScale * 0.000001, 0.000000000000000001)) return vec2(0.0);
    return vec2(
      shadowDy.y * shadowDx.z - shadowDx.y * shadowDy.z,
      shadowDx.x * shadowDy.z - shadowDy.x * shadowDx.z
    ) / determinant;
  }

  float terrainProjectGroundShadowDepth(vec3 shadowCoord, vec2 sampleUv, vec2 gradient) {
    #ifdef GRAPHICS_API_WEBGL2
      // A bilinear comparison shares one reference depth across four texel centres.
      // Use the lowest receiving-plane depth in the actual footprint, which can
      // extend almost a full texel from the fetch rather than a fixed half texel.
      vec2 phase = fract(sampleUv * scene_ShadowMapSize.zw - 0.5);
      float minimumX = phase.x == 0.0 ? 0.0 : min(-phase.x * gradient.x, (1.0 - phase.x) * gradient.x);
      float minimumY = phase.y == 0.0 ? 0.0 : min(-phase.y * gradient.y, (1.0 - phase.y) * gradient.y);
      float bilinearBias = -(minimumX * scene_ShadowMapSize.x + minimumY * scene_ShadowMapSize.y);
    #else
      // Preserve the existing fallback for depth/packed-depth texture filtering.
      float bilinearBias = dot(abs(gradient), scene_ShadowMapSize.xy) * 0.5;
    #endif
    return shadowCoord.z + dot(sampleUv - shadowCoord.xy, gradient) - bilinearBias;
  }

  float sampleTerrainProjectGroundShadowMap(vec3 positionWS, vec3 positionDx, vec3 positionDy) {
    mat4 shadowMatrix = terrainProjectGroundShadowMatrix(positionWS);
    vec3 shadowCoord = (shadowMatrix * vec4(positionWS, 1.0)).xyz;
    // Transform continuous world derivatives with this pixel's single cascade matrix.
    // Differentiating atlas coordinates would mix different cascades at split boundaries.
    vec3 shadowDx = (shadowMatrix * vec4(positionDx, 0.0)).xyz;
    vec3 shadowDy = (shadowMatrix * vec4(positionDy, 0.0)).xyz;
    vec2 gradient = terrainProjectGroundShadowGradient(shadowDx, shadowDy);
    float attenuation = 1.0;
    if (shadowCoord.z > 0.0 && shadowCoord.z < 1.0) {
      attenuation = 0.0;
      #if SCENE_SHADOW_TYPE == 3
        float weights[9];
        vec2 sampleUvs[9];
        sampleShadowComputeSamplesTent5x5(scene_ShadowMapSize, shadowCoord.xy, weights, sampleUvs);
        for (int i = 0; i < 9; i++) {
          vec3 sampleCoord = vec3(sampleUvs[i], terrainProjectGroundShadowDepth(shadowCoord, sampleUvs[i], gradient));
          attenuation += weights[i] * SAMPLE_TEXTURE2D_SHADOW(scene_ShadowMap, sampleCoord);
        }
      #else
        vec2 halfTexel = scene_ShadowMapSize.xy * 0.5;
        for (int i = 0; i < 4; i++) {
          vec2 direction = vec2(mod(float(i), 2.0), floor(float(i) / 2.0)) * 2.0 - 1.0;
          vec2 sampleUv = shadowCoord.xy + direction * halfTexel;
          vec3 sampleCoord = vec3(sampleUv, terrainProjectGroundShadowDepth(shadowCoord, sampleUv, gradient));
          attenuation += SAMPLE_TEXTURE2D_SHADOW(scene_ShadowMap, sampleCoord) * 0.25;
        }
      #endif
      float shadowFade = getShadowFade(positionWS);
      attenuation = mix(1.0, mix(attenuation, 1.0, shadowFade), scene_ShadowInfo.x);
    }
    return attenuation;
  }
#endif

#ifdef TERRAIN_PROJECT_GROUND_SHADOW_PCF
float sampleTerrainProjectGroundShadow(Varyings varyings, vec3 positionDx, vec3 positionDy) {
  float attenuation = 1.0;
  #if defined(SCENE_DIRECT_LIGHT_COUNT) && defined(NEED_CALCULATE_SHADOWS)
    attenuation = sampleTerrainProjectGroundShadowMap(varyings.positionWS, positionDx, positionDy);
  #endif
  return attenuation * sampleVolumetricCloudShadow(varyings.positionWS);
}
#else
float sampleTerrainProjectShadow(Varyings varyings) {
  float attenuation = 1.0;
  #if defined(SCENE_DIRECT_LIGHT_COUNT) && defined(NEED_CALCULATE_SHADOWS)
    #if SCENE_SHADOW_CASCADED_COUNT == 1
      vec3 receiverShadowCoord = varyings.shadowCoord;
    #else
      vec3 receiverShadowCoord = getShadowCoord(varyings.positionWS);
    #endif
    attenuation = sampleShadowMap(varyings.positionWS, receiverShadowCoord);
  #endif
  return attenuation * sampleVolumetricCloudShadow(varyings.positionWS);
}
#endif
#endif

#ifdef TERRAIN_PROJECT_SHADOW_CASTER_PASS
vec2 scene_ShadowBias;
vec3 scene_LightDirection;

vec3 applyTerrainProjectShadowBias(vec3 positionWS, vec3 normalWS) {
  positionWS -= scene_LightDirection * scene_ShadowBias.x;
  float inverseNdotL = 1.0 - clamp(dot(-scene_LightDirection, normalWS), 0.0, 1.0);
  return positionWS + normalWS * (inverseNdotL * scene_ShadowBias.y);
}

vec4 terrainProjectShadowClipPosition(vec3 positionWS) {
  vec4 positionCS = camera_VPMat * vec4(positionWS, 1.0);
  positionCS.z = max(positionCS.z, -1.0);
  return positionCS;
}

#ifdef ENGINE_NO_DEPTH_TEXTURE
vec4 packTerrainProjectShadowDepth(float depth) {
  const vec4 bitShift = vec4(1.0, 256.0, 65536.0, 16777216.0);
  const vec4 bitMask = vec4(1.0 / 256.0, 1.0 / 256.0, 1.0 / 256.0, 0.0);
  vec4 packedDepth = fract(depth * bitShift);
  return packedDepth - packedDepth.gbaa * bitMask;
}
#endif

vec4 terrainProjectShadowColor() {
  #ifdef ENGINE_NO_DEPTH_TEXTURE
    return packTerrainProjectShadowDepth(gl_FragCoord.z);
  #else
    return vec4(0.0);
  #endif
}
#endif

#endif
