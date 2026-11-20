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
        #ifdef CAMERA_ENABLE_SSR
        if (material_ReflectionSource > 2.5) {
          vec3 fallbackEnvironment = mix(
            rawAnalyticReflectionSample,
            rawEnvironmentReflectionSample,
            rawEnvironmentReflectionValidity
          );
          vec3 ssrComposited = evaluateScreenSpaceReflection(
            input.clipPosition,
            surfaceNormalWS,
            rainRippleSurfaceRoughness,
            fallbackEnvironment
          );
          rawSsrReflectionValidity = waterConnectionFacts(input.worldPosition.xz).y;
          rawSsrReflectionPremultipliedSample = ssrComposited * rawSsrReflectionValidity;
        }
        #endif
        float reflectionIntensity = max(material_ReflectionIntensity, 0.0);
