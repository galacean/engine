#ifndef SHADOW_INCLUDED
#define SHADOW_INCLUDED


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
    
            mat4 shadowMatrix = scene_ShadowMatrices[cascadeIndex];
    
        vec4 shadowCoord = shadowMatrix * vec4(positionWS, 1.0);
        return shadowCoord.xyz;
    }
#endif


#ifdef NEED_CALCULATE_SHADOWS
    // intensity, null, fadeScale, fadeBias
    vec4 scene_ShadowInfo;
    vec4 scene_ShadowMapSize;

    mediump sampler2DShadow scene_ShadowMap;

    #if SCENE_SHADOW_TYPE == 2
        float sampleShadowMapFiltered4(mediump sampler2DShadow shadowMap, vec3 shadowCoord, vec4 shadowMapSize) {
            float attenuation;
            vec4 attenuation4;
            vec2 offset=shadowMapSize.xy/2.0;
            vec3 shadowCoord0=shadowCoord + vec3(-offset,0.0);
            vec3 shadowCoord1=shadowCoord + vec3(offset.x,-offset.y,0.0);
            vec3 shadowCoord2=shadowCoord + vec3(-offset.x,offset.y,0.0);
            vec3 shadowCoord3=shadowCoord + vec3(offset,0.0);
            attenuation4.x = textureLod(shadowMap, shadowCoord0, 0.0);
            attenuation4.y = textureLod(shadowMap, shadowCoord1, 0.0);
            attenuation4.z = textureLod(shadowMap, shadowCoord2, 0.0);
            attenuation4.w = textureLod(shadowMap, shadowCoord3, 0.0);
            attenuation = dot(attenuation4, vec4(0.25));
            return attenuation;
        }
    #endif

    #if SCENE_SHADOW_TYPE == 3
        #include "ShaderLibrary/Shadow/ShadowSampleTent.glsl"

        float sampleShadowMapFiltered9(mediump sampler2DShadow shadowMap, vec3 shadowCoord, vec4 shadowmapSize) {
            float attenuation;
            float fetchesWeights[9];
            vec2 fetchesUV[9];
            sampleShadowComputeSamplesTent5x5(shadowmapSize, shadowCoord.xy, fetchesWeights, fetchesUV);
            attenuation = fetchesWeights[0] * textureLod(shadowMap, vec3(fetchesUV[0].xy, shadowCoord.z), 0.0);
            attenuation += fetchesWeights[1] * textureLod(shadowMap, vec3(fetchesUV[1].xy, shadowCoord.z), 0.0);
            attenuation += fetchesWeights[2] * textureLod(shadowMap, vec3(fetchesUV[2].xy, shadowCoord.z), 0.0);
            attenuation += fetchesWeights[3] * textureLod(shadowMap, vec3(fetchesUV[3].xy, shadowCoord.z), 0.0);
            attenuation += fetchesWeights[4] * textureLod(shadowMap, vec3(fetchesUV[4].xy, shadowCoord.z), 0.0);
            attenuation += fetchesWeights[5] * textureLod(shadowMap, vec3(fetchesUV[5].xy, shadowCoord.z), 0.0);
            attenuation += fetchesWeights[6] * textureLod(shadowMap, vec3(fetchesUV[6].xy, shadowCoord.z), 0.0);
            attenuation += fetchesWeights[7] * textureLod(shadowMap, vec3(fetchesUV[7].xy, shadowCoord.z), 0.0);
            attenuation += fetchesWeights[8] * textureLod(shadowMap, vec3(fetchesUV[8].xy, shadowCoord.z), 0.0);
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
            attenuation = textureLod(scene_ShadowMap, shadowCoord, 0.0);
        #endif

        #if SCENE_SHADOW_TYPE == 2
            attenuation = sampleShadowMapFiltered4(scene_ShadowMap, shadowCoord, scene_ShadowMapSize);
        #endif

        #if SCENE_SHADOW_TYPE == 3
            attenuation = sampleShadowMapFiltered9(scene_ShadowMap, shadowCoord, scene_ShadowMapSize);
        #endif

        float shadowFade = getShadowFade(positionWS);
        attenuation = mix(1.0, mix(attenuation, 1.0, shadowFade), scene_ShadowInfo.x);
        }
        return attenuation;
    }
#endif


#endif