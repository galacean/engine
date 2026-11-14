      const float WATER_SURFACE_PI = 3.141592653589793;

      vec3 waterSurfaceLightingSafeNormalize3(vec3 value, vec3 fallbackValue) {
        float lengthSquared = dot(value, value);
        return lengthSquared > 0.000001 ? value * inversesqrt(lengthSquared) : fallbackValue;
      }

      vec3 waterSurfaceAppearanceAmbientIrradiance(vec3 normalWS) {
        vec3 ambientIrradiance = scene_EnvMapLight.diffuse * WATER_SURFACE_PI;
        #ifdef SCENE_USE_SH
          ambientIrradiance = max(
            scene_EnvSH[0]
              + scene_EnvSH[1] * normalWS.y
              + scene_EnvSH[2] * normalWS.z
              + scene_EnvSH[3] * normalWS.x
              + scene_EnvSH[4] * (normalWS.y * normalWS.x)
              + scene_EnvSH[5] * (normalWS.y * normalWS.z)
              + scene_EnvSH[6] * (3.0 * normalWS.z * normalWS.z - 1.0)
              + scene_EnvSH[7] * (normalWS.z * normalWS.x)
              + scene_EnvSH[8] * (normalWS.x * normalWS.x - normalWS.y * normalWS.y),
            vec3(0.0)
          );
        #endif
        return ambientIrradiance * max(scene_EnvMapLight.diffuseIntensity, 0.0);
      }

      void evaluateWaterSurfaceDirectionalLighting(
        vec3 positionWS,
        vec3 normalWS,
        vec3 viewDirection,
        float normalDotView,
        float fresnelF0,
        float roughness,
        float litSceneColorSpecular,
        out vec3 directDiffuseRadiance,
        out vec3 directSpecularRadiance
      ) {
        WaterSurfaceResolvedLightingV2 resolvedLighting = waterSurfaceCreateResolvedLightingV2(vec3(0.0));
        #ifdef SCENE_DIRECT_LIGHT_COUNT
          for (int lightIndex = 0; lightIndex < SCENE_DIRECT_LIGHT_COUNT; lightIndex++) {
            if (!waterSurfaceIsRendererCulledByLight(renderer_Layer.xy, scene_DirectLightCullingMask[lightIndex])) {
              #ifdef GRAPHICS_API_WEBGL2
                WaterSurfaceDirectLight directionalLight = getWaterSurfaceDirectLight(lightIndex);
              #else
                WaterSurfaceDirectLight directionalLight;
                directionalLight.color = scene_DirectLightColor[lightIndex];
                directionalLight.direction = scene_DirectLightDirection[lightIndex];
              #endif
              vec3 lightDirection = -directionalLight.direction;
              float lightDirectionLengthSquared = dot(lightDirection, lightDirection);
              if (lightDirectionLengthSquared > 0.000001) {
                lightDirection *= inversesqrt(lightDirectionLengthSquared);
                float lightAttenuation = 1.0;
                if (lightIndex == 0) {
                  lightAttenuation *= sampleVolumetricCloudShadow(positionWS);
                }
                vec3 lightRadiance = max(directionalLight.color, vec3(0.0)) * lightAttenuation;
                float normalDotLight = saturate(dot(normalWS, lightDirection));
                vec3 halfDirection = waterSurfaceLightingSafeNormalize3(
                  viewDirection + lightDirection,
                  lightDirection
                );
                float normalDotHalf = saturate(dot(normalWS, halfDirection));
                float lightDotHalf = saturate(dot(lightDirection, halfDirection));
                resolvedLighting = waterSurfaceAccumulateDirectLightingV2(
                  resolvedLighting,
                  lightRadiance,
                  normalDotView,
                  normalDotLight,
                  normalDotHalf,
                  lightDotHalf,
                  fresnelF0,
                  roughness,
                  saturate(litSceneColorSpecular) * 2.0,
                  1.0
                );
              }
            }
          }
        #endif
        directDiffuseRadiance = resolvedLighting.diffuseRadiance;
        directSpecularRadiance = resolvedLighting.directSpecularRadiance;
      }
