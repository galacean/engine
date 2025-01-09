#ifndef SHADOW_INCLUDED
#define SHADOW_INCLUDED

#include "Transform.glsl"
#include "Common.glsl"

#if defined(SCENE_SHADOW_TYPE) && defined(RENDERER_IS_RECEIVE_SHADOWS)
    #define NEED_CALCULATE_SHADOWS
#endif


#ifdef NEED_CALCULATE_SHADOWS
    mat4 scene_ShadowMatrices[SCENE_SHADOW_CASCADED_COUNT + 1];
    vec4 scene_ShadowSplitSpheres[4];

    mediump int computeCascadeIndex(vec3 positionWS) {
        vec3 fromCenter0 = positionWS - scene_ShadowSplitSpheres[0].xyz;
        vec3 fromCenter1 = positionWS - scene_ShadowSplitSpheres[1].xyz;
        vec3 fromCenter2 = positionWS - scene_ShadowSplitSpheres[2].xyz;
        vec3 fromCenter3 = positionWS - scene_ShadowSplitSpheres[3].xyz;

        mediump vec4 comparison = vec4(
            (dot(fromCenter0, fromCenter0) < scene_ShadowSplitSpheres[0].w),
            (dot(fromCenter1, fromCenter1) < scene_ShadowSplitSpheres[1].w),
            (dot(fromCenter2, fromCenter2) < scene_ShadowSplitSpheres[2].w),
            (dot(fromCenter3, fromCenter3) < scene_ShadowSplitSpheres[3].w));
        comparison.yzw = clamp(comparison.yzw - comparison.xyz,0.0,1.0);//keep the nearest
        mediump vec4 indexCoefficient = vec4(4.0,3.0,2.0,1.0);
        mediump int index = 4 - int(dot(comparison, indexCoefficient));
        return index;
    }

    vec3 getShadowCoord(vec3 positionWS) {
        #if SCENE_SHADOW_CASCADED_COUNT == 1
            mediump int cascadeIndex = 0;
        #else
            mediump int cascadeIndex = computeCascadeIndex(positionWS);
        #endif
    
        #ifdef GRAPHICS_API_WEBGL2
            mat4 shadowMatrix = scene_ShadowMatrices[cascadeIndex];
        #else
            mat4 shadowMatrix;
            #if SCENE_SHADOW_CASCADED_COUNT == 4
                if (cascadeIndex == 0) {
                    shadowMatrix = scene_ShadowMatrices[0];
                } else if (cascadeIndex == 1) {
                    shadowMatrix = scene_ShadowMatrices[1];
                } else if (cascadeIndex == 2) {
                    shadowMatrix = scene_ShadowMatrices[2];
                } else if (cascadeIndex == 3) {
                    shadowMatrix = scene_ShadowMatrices[3];
                } else {
                    shadowMatrix = scene_ShadowMatrices[4];
                }
            #endif
            #if SCENE_SHADOW_CASCADED_COUNT == 2
                if (cascadeIndex == 0) {
                    shadowMatrix = scene_ShadowMatrices[0];
                } else if (cascadeIndex == 1) {
                    shadowMatrix = scene_ShadowMatrices[1];
                } else {
                    shadowMatrix = scene_ShadowMatrices[2];
                } 
            #endif
            #if SCENE_SHADOW_CASCADED_COUNT == 1
                if (cascadeIndex == 0) {
                    shadowMatrix = scene_ShadowMatrices[0];
                } else  {
                    shadowMatrix = scene_ShadowMatrices[1];
                } 
            #endif
        #endif
    
        vec4 shadowCoord = shadowMatrix * vec4(positionWS, 1.0);
        return shadowCoord.xyz;
    }
#endif


#ifdef NEED_CALCULATE_SHADOWS
    // intensity, null, fadeScale, fadeBias
    vec4 scene_ShadowInfo;
    vec4 scene_ShadowMapSize;

    #ifdef GRAPHICS_API_WEBGL2
        mediump sampler2DShadow scene_ShadowMap;
        #define SAMPLE_TEXTURE2D_SHADOW(textureName, coord3) textureLod(textureName, coord3 , 0.0)
        #define TEXTURE2D_SHADOW_PARAM(shadowMap) mediump sampler2DShadow shadowMap
    #else
        sampler2D scene_ShadowMap;
        #ifdef ENGINE_NO_DEPTH_TEXTURE
            const vec4 bitShift = vec4(1.0, 1.0/256.0, 1.0/(256.0*256.0), 1.0/(256.0*256.0*256.0));
            /**
            * Unpack depth value.
            */
            float unpack(in vec4 rgbaDepth) {
                return dot(rgbaDepth, bitShift);
            }
            #define SAMPLE_TEXTURE2D_SHADOW(textureName, coord3) (unpack(texture2D(textureName, coord3.xy)) < coord3.z ? 0.0 : 1.0)
        #else
            #define SAMPLE_TEXTURE2D_SHADOW(textureName, coord3) ((texture2D(textureName, coord3.xy)).r < coord3.z ? 0.0 : 1.0)
        #endif
        #define TEXTURE2D_SHADOW_PARAM(shadowMap) mediump sampler2D shadowMap
    #endif

    #if SCENE_SHADOW_TYPE == 2
        float sampleShadowMapFiltered4(TEXTURE2D_SHADOW_PARAM(shadowMap), vec3 shadowCoord, vec4 shadowMapSize) {
            float attenuation;
            vec4 attenuation4;
            vec2 offset=shadowMapSize.xy/2.0;
            vec3 shadowCoord0=shadowCoord + vec3(-offset,0.0);
            vec3 shadowCoord1=shadowCoord + vec3(offset.x,-offset.y,0.0);
            vec3 shadowCoord2=shadowCoord + vec3(-offset.x,offset.y,0.0);
            vec3 shadowCoord3=shadowCoord + vec3(offset,0.0);
            attenuation4.x = SAMPLE_TEXTURE2D_SHADOW(shadowMap, shadowCoord0);
            attenuation4.y = SAMPLE_TEXTURE2D_SHADOW(shadowMap, shadowCoord1);
            attenuation4.z = SAMPLE_TEXTURE2D_SHADOW(shadowMap, shadowCoord2);
            attenuation4.w = SAMPLE_TEXTURE2D_SHADOW(shadowMap, shadowCoord3);
            attenuation = dot(attenuation4, vec4(0.25));
            return attenuation;
        }
    #endif

    #if SCENE_SHADOW_TYPE == 3
        #include "ShadowSampleTent.glsl"

        float sampleShadowMapFiltered9(TEXTURE2D_SHADOW_PARAM(shadowMap), vec3 shadowCoord, vec4 shadowmapSize) {
            float attenuation;
            float fetchesWeights[9];
            vec2 fetchesUV[9];
            sampleShadowComputeSamplesTent5x5(shadowmapSize, shadowCoord.xy, fetchesWeights, fetchesUV);
            attenuation = fetchesWeights[0] * SAMPLE_TEXTURE2D_SHADOW(shadowMap, vec3(fetchesUV[0].xy, shadowCoord.z));
            attenuation += fetchesWeights[1] * SAMPLE_TEXTURE2D_SHADOW(shadowMap, vec3(fetchesUV[1].xy, shadowCoord.z));
            attenuation += fetchesWeights[2] * SAMPLE_TEXTURE2D_SHADOW(shadowMap, vec3(fetchesUV[2].xy, shadowCoord.z));
            attenuation += fetchesWeights[3] * SAMPLE_TEXTURE2D_SHADOW(shadowMap, vec3(fetchesUV[3].xy, shadowCoord.z));
            attenuation += fetchesWeights[4] * SAMPLE_TEXTURE2D_SHADOW(shadowMap, vec3(fetchesUV[4].xy, shadowCoord.z));
            attenuation += fetchesWeights[5] * SAMPLE_TEXTURE2D_SHADOW(shadowMap, vec3(fetchesUV[5].xy, shadowCoord.z));
            attenuation += fetchesWeights[6] * SAMPLE_TEXTURE2D_SHADOW(shadowMap, vec3(fetchesUV[6].xy, shadowCoord.z));
            attenuation += fetchesWeights[7] * SAMPLE_TEXTURE2D_SHADOW(shadowMap, vec3(fetchesUV[7].xy, shadowCoord.z));
            attenuation += fetchesWeights[8] * SAMPLE_TEXTURE2D_SHADOW(shadowMap, vec3(fetchesUV[8].xy, shadowCoord.z));
            return attenuation;
        }
    #endif


    float getShadowFade(vec3 positionWS){
        vec3 camToPixel = positionWS - camera_Position;
        float distanceCamToPixel2 = dot(camToPixel, camToPixel);
        return saturate( distanceCamToPixel2 * scene_ShadowInfo.z + scene_ShadowInfo.w );
    }


    float sampleShadowMap(vec3 positionWS, vec3 shadowCoord) {
        float attenuation = 1.0;
        if(shadowCoord.z > 0.0 && shadowCoord.z < 1.0) {
        #if SCENE_SHADOW_TYPE == 1
            attenuation = SAMPLE_TEXTURE2D_SHADOW(scene_ShadowMap, shadowCoord);
        #endif

        #if SCENE_SHADOW_TYPE == 2
            attenuation = sampleShadowMapFiltered4(scene_ShadowMap, shadowCoord, scene_ShadowMapSize);
        #endif

        #if SCENE_SHADOW_TYPE == 3
            attenuation = sampleShadowMapFiltered9(scene_ShadowMap, shadowCoord, scene_ShadowMapSize);
        #endif
            attenuation = mix(1.0, attenuation, scene_ShadowInfo.x);
        }

        float shadowFade = getShadowFade(positionWS);
        attenuation = mix(1.0, mix(attenuation, 1.0, shadowFade), scene_ShadowInfo.x);

        return attenuation;
    }
#endif


#endif