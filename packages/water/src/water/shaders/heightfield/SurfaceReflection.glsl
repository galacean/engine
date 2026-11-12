        vec3 probeDirection = safeNormalize3(
          reflect(-viewDirection, surfaceNormalWS),
          input.baseNormalWS
        );
        vec3 rawAnalyticReflectionSample = waterSurfaceResolveAnalyticReflectionFallbackV2(
          surfaceNormalWS.y,
          effectiveSurfaceRoughness,
          scene_EnvMapLight.specularIntensity
        );
        vec3 rawEnvironmentReflectionSample;
        float rawEnvironmentReflectionValidity;
        waterSurfaceSampleRawEnvironmentReflectionV2(
          probeDirection,
          input.worldPosition,
          effectiveSurfaceRoughness,
          rawEnvironmentReflectionSample,
          rawEnvironmentReflectionValidity
        );
        vec3 rawSsrReflectionPremultipliedSample = vec3(0.0);
        float rawSsrReflectionValidity = 0.0;
        if (
          material_ReflectionSource > 2.5 &&
          rainRippleSurfaceRoughness < camera_ScreenSpaceReflectionMaxRoughness
        ) {
          vec2 ssrScreenUv = (input.clipPosition.xy / input.clipPosition.w) * 0.5 + 0.5;
          vec4 ssrReflection = texture2D(camera_ScreenSpaceReflectionTexture, ssrScreenUv);
          float ssrGlobalIntensity = saturate(camera_ScreenSpaceReflectionIntensity);
          ssrGlobalIntensity *= waterConnectionFacts(input.worldPosition.xz).y;
          rawSsrReflectionPremultipliedSample = ssrReflection.rgb * ssrGlobalIntensity;
          rawSsrReflectionValidity = saturate(
            ssrReflection.a * ssrGlobalIntensity
          );
        }
        float reflectionIntensity = max(material_ReflectionIntensity, 0.0);
