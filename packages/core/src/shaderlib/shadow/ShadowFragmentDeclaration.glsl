#if defined(SCENE_SHADOW_TYPE) && defined(RENDERER_IS_RECEIVE_SHADOWS)
    #define SCENE_IS_CALCULATE_SHADOWS
#endif

#ifdef SCENE_IS_CALCULATE_SHADOWS
    #if SCENE_SHADOW_CASCADED_COUNT == 1
        varying vec3 v_shadowCoord;
    #else
        #include <ShadowCoord>
    #endif
    
    // intensity, resolution, sunIndex
    uniform vec3 scene_ShadowInfo;
    uniform vec4 scene_ShadowMapSize;

    #ifdef GRAPHICS_API_WEBGL2
        uniform mediump sampler2DShadow scene_ShadowMap;
        #define SAMPLE_TEXTURE2D_SHADOW(textureName, coord3) textureLod(textureName, coord3 , 0.0)
        #define TEXTURE2D_SHADOW_PARAM(shadowMap) mediump sampler2DShadow shadowMap
    #else
        uniform sampler2D scene_ShadowMap;
        #ifdef ENGINE_NO_DEPTH_TEXTURE
            const vec4 bitShift = vec4(1.0, 1.0/256.0, 1.0/(256.0*256.0), 1.0/(256.0*256.0*256.0));
            /**
            * Unpack depth value.
            */
            float unpack(const in vec4 rgbaDepth) {
                return dot(rgbaDepth, bitShift);
            }
            #define SAMPLE_TEXTURE2D_SHADOW(textureName, coord3) (unpack(texture2D(textureName, coord3.xy)) < coord3.z ? 0.0 : 1.0)
        #else
            #define SAMPLE_TEXTURE2D_SHADOW(textureName, coord3) (texture2D(textureName, coord3.xy).r < coord3.z ? 0.0 : 1.0)
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
        #include <shadow_sample_tent>

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

    float sampleShadowMap() {
        #if SCENE_SHADOW_CASCADED_COUNT == 1
            vec3 shadowCoord = v_shadowCoord;
        #else
            vec3 shadowCoord = getShadowCoord();
        #endif
        
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
        return attenuation;
    }
#endif