#if defined(CASCADED_SHADOW_MAP)&&defined(OASIS_RECEIVE_SHADOWS)
    #define OASIS_CALCULATE_SHADOWS
#endif

#ifdef OASIS_CALCULATE_SHADOWS
        // intensity, resolution, sunIndex
        uniform vec3 u_shadowInfo;
        uniform vec4 u_shadowMapSize;
        uniform mat4 u_shadowMatrices[5];
        uniform vec4 u_shadowSplitSpheres[4];


        varying vec3 view_pos;

        #ifdef GRAPHICS_API_WEBGL2
            uniform mediump sampler2DShadow u_shadowMap;
            #define SAMPLE_TEXTURE2D_SHADOW(textureName, coord3) textureLod(textureName, coord3 , 0.0)
            #define TEXTURE2D_SHADOW_PARAM(shadowMap) mediump sampler2DShadow shadowMap
        #else
            uniform sampler2D u_shadowMap;
            #ifdef OASIS_NO_DEPTH_TEXTURE
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

        mediump int computeCascadeIndex(vec3 positionWS) {
            vec3 fromCenter0 = positionWS - u_shadowSplitSpheres[0].xyz;
            vec3 fromCenter1 = positionWS - u_shadowSplitSpheres[1].xyz;
            vec3 fromCenter2 = positionWS - u_shadowSplitSpheres[2].xyz;
            vec3 fromCenter3 = positionWS - u_shadowSplitSpheres[3].xyz;

            mediump vec4 comparison = vec4(
                dot(fromCenter0, fromCenter0) < u_shadowSplitSpheres[0].w,
                dot(fromCenter1, fromCenter1) < u_shadowSplitSpheres[1].w,
                dot(fromCenter2, fromCenter2) < u_shadowSplitSpheres[2].w,
                dot(fromCenter3, fromCenter3) < u_shadowSplitSpheres[3].w);
            comparison.yzw = clamp(comparison.yzw - comparison.xyz,0.0,1.0);//keep the nearest
            mediump vec4 indexCoefficient = vec4(4.0,3.0,2.0,1.0);
            mediump int index = 4 - int(dot(comparison, indexCoefficient));
            return index;
        }

        vec3 getShadowCoord() {
            int cascadeIndex = computeCascadeIndex(v_pos);

            #ifdef GRAPHICS_API_WEBGL2
                mat4 shadowMatrix = u_shadowMatrices[cascadeIndex];
            #else
                mat4 shadowMatrix;
                if (cascadeIndex == 0) {
                    shadowMatrix = u_shadowMatrices[0];
                } else if (cascadeIndex == 1) {
                    shadowMatrix = u_shadowMatrices[1];
                } else if (cascadeIndex == 2) {
                    shadowMatrix = u_shadowMatrices[2];
                } else if (cascadeIndex == 3) {
                    shadowMatrix = u_shadowMatrices[3];
                } else {
                    shadowMatrix = u_shadowMatrices[4];
                }
            #endif

            vec4 shadowCoord = shadowMatrix * vec4(v_pos, 1.0);
            return shadowCoord.xyz / shadowCoord.w;
        }

        #if SHADOW_MODE == 2
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

        #if SHADOW_MODE == 3
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
            vec3 shadowCoord = getShadowCoord();
            float attenuation = 1.0;
            if(shadowCoord.z > 0.0 && shadowCoord.z < 1.0) {
            #if SHADOW_MODE == 1
                attenuation = SAMPLE_TEXTURE2D_SHADOW(u_shadowMap, shadowCoord);
            #endif

            #if SHADOW_MODE == 2
                attenuation = sampleShadowMapFiltered4(u_shadowMap, shadowCoord, u_shadowMapSize);
            #endif

            #if SHADOW_MODE == 3
                attenuation = sampleShadowMapFiltered9(u_shadowMap, shadowCoord, u_shadowMapSize);
            #endif
                attenuation = mix(1.0, attenuation, u_shadowInfo.x);
            }
            return attenuation;
        }
#endif