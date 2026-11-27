        vec3 rawAnalyticReflectionSample = vec3(0.0);
        vec3 rawEnvironmentReflectionSample = vec3(0.0);
        float rawEnvironmentReflectionValidity = 0.0;
        vec3 rawSsrReflectionPremultipliedSample = vec3(0.0);
        float rawSsrReflectionValidity = 0.0;
        bool sampleEnvironmentReflection = true;
        #ifdef CAMERA_ENABLE_SSR
        if (material_ReflectionSource > 2.5) {
          vec4 ssrRaw = sampleScreenSpaceReflectionRaw(
            input.clipPosition,
            surfaceNormalWS,
            rainRippleSurfaceRoughness
          );
          float connectionSsrValidity = clamp(waterConnectionFacts(input.worldPosition.xz).y, 0.0, 1.0);
          rawSsrReflectionValidity = connectionSsrValidity * ssrRaw.a;
          rawSsrReflectionPremultipliedSample = ssrRaw.rgb * connectionSsrValidity;
          float ssrCompositeScale = clamp(material_WaterScreenSpaceReflectionCompositeIntensity, 0.0, 1.0);
          sampleEnvironmentReflection = rawSsrReflectionValidity * ssrCompositeScale < 0.9999;
        }
        #endif
        if (sampleEnvironmentReflection) {
          vec3 probeDirection = safeNormalize3(
            reflect(-viewDirection, surfaceNormalWS),
            input.baseNormalWS
          );
          rawAnalyticReflectionSample = waterSurfaceResolveAnalyticReflectionFallbackV2(
            surfaceNormalWS.y,
            effectiveSurfaceRoughness,
            scene_EnvMapLight.specularIntensity
          );
          waterSurfaceSampleRawEnvironmentReflectionV2(
            probeDirection,
            input.worldPosition,
            effectiveSurfaceRoughness,
            rawEnvironmentReflectionSample,
            rawEnvironmentReflectionValidity
          );
        }
        float reflectionIntensity = max(material_ReflectionIntensity, 0.0);
