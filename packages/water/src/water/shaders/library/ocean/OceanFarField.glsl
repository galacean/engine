#ifndef WATER_OCEAN_FAR_FIELD_INCLUDED
#define WATER_OCEAN_FAR_FIELD_INCLUDED

      vec3 oceanFarFieldSafeNormalize(
        vec3 value,
        vec3 fallbackValue
      ) {
        float lengthSquared = dot(value, value);
        return lengthSquared > 0.00000001 ? value * inversesqrt(lengthSquared) : fallbackValue;
      }

      vec3 oceanFarFieldSrgbToLinear(vec3 color) {
        vec3 low = color / 12.92;
        vec3 high = pow(max((color + 0.055) / 1.055, vec3(0.0)), vec3(2.4));
        return mix(low, high, step(vec3(0.04045), color));
      }

      // Reflecting a normal slope doubles its angular excursion. Preserve the
      // unresolved reflection cone with one prefiltered environment lookup.
      vec3 oceanFarReflectionDirection(vec3 viewDirection) {
        vec3 direction = reflect(-viewDirection, vec3(0.0, 1.0, 0.0));
        direction.y = sqrt(direction.y * direction.y + 4.0 * material_OceanFarReflectionFilter.y);
        return normalize(direction);
      }

      float oceanFarReflectionNormalDotView(vec3 viewDirection) {
        // For a symmetric Gaussian slope, E[max(slope, 0)] = sigma / sqrt(2*pi).
        // This bounded moment avoids treating the whole wave distribution as
        // a single positive RMS slope, which removes too much grazing reflection.
        float normalDotView = clamp(viewDirection.y, 0.0, 1.0);
        float positiveSlopeMeanSquared = material_OceanFarReflectionFilter.y * 0.159154943;
        return clamp(sqrt(normalDotView * normalDotView + positiveSlopeMeanSquared), 0.0, 1.0);
      }

      vec3 sampleOceanFarFieldReflection(vec3 analyticFallback, vec3 directionWS) {
        if (material_EnvironmentReflectionAvailable < 0.5) return analyticFallback;
        vec2 rotation = material_EnvironmentReflectionParameters.xy;
        vec3 sampleDirection = vec3(
          rotation.x * directionWS.x + rotation.y * directionWS.z,
          directionWS.y,
          -rotation.y * directionWS.x + rotation.x * directionWS.z
        );
        float mipLevel = clamp(material_OceanFarReflectionFilter.x, 0.0, 1.0)
          * max(material_EnvironmentReflectionMaximumMip, 0.0);
        #ifdef HAS_TEX_LOD
          vec3 reflectedRadiance = textureCubeLodEXT(
            material_ReflectionCubeTexture,
            sampleDirection,
            mipLevel
          ).rgb;
        #else
          vec3 reflectedRadiance = textureCube(
            material_ReflectionCubeTexture,
            sampleDirection,
            mipLevel
          ).rgb;
        #endif
        #ifdef ENGINE_NO_SRGB
          reflectedRadiance = mix(
            reflectedRadiance,
            oceanFarFieldSrgbToLinear(reflectedRadiance),
            step(0.5, material_EnvironmentReflectionParameters.w)
          );
        #endif
        return reflectedRadiance
          * max(material_EnvironmentReflectionParameters.z, 0.0)
          * max(material_EnvironmentFallbackIntensity, 0.0);
      }

      // used by the far renderer. Missing scene/detail signals are not zero data.


      vec3 oceanFarFieldRadiance(vec3 worldPosition) {
        const vec3 surfaceNormal = vec3(0.0, 1.0, 0.0);
        vec3 viewDirection = oceanFarFieldSafeNormalize(
          camera_Position - worldPosition,
          surfaceNormal
        );
        float horizonFactor = pow(
          1.0 - clamp(dot(viewDirection, surfaceNormal), 0.0, 1.0),
          8.0
        ) * material_OceanHorizonColor.a;
        vec3 baseColor = mix(
          material_OceanDeepColor.rgb,
          material_OceanHorizonColor.rgb,
          horizonFactor
        );

        vec3 lightVector = -scene_SunlightDirection;
        float sunlightAvailable = step(0.00000001, dot(lightVector, lightVector));
        vec3 lightDirection = oceanFarFieldSafeNormalize(lightVector, surfaceNormal);
        vec3 sunlightColor = max(scene_SunlightColor.rgb, vec3(0.0)) * sunlightAvailable;
        vec3 diffuseLighting = waterSurfaceAmbientDiffuseRadiance(surfaceNormal)
          + sunlightColor * max(dot(surfaceNormal, lightDirection), 0.0);
        // Scene-texture-free capability: a fully opaque deep-water limit,
        // with flat geometric normal and rough environment sampling.
{{SHARED_FAR_GEOMETRY_BRIDGE}}
        WaterSurfaceRawRefractionFactsV2 rawRefractionFacts;
        rawRefractionFacts.centeredSceneSample = vec3(0.0);
        rawRefractionFacts.displacedSceneSample = vec3(0.0);
        rawRefractionFacts.displacedSampleValidity = 0.0;
        rawRefractionFacts.depthWeight = 0.0;
        rawRefractionFacts.shoreValidity = 1.0;
        rawRefractionFacts.coverage = waterSurface_coverage;
        WaterSurfaceRawReflectionFactsV2 rawReflectionFacts;
        rawReflectionFacts.analyticSample = waterSurfaceResolveAnalyticReflectionFallbackV2(1.0, material_OceanFarReflectionFilter.x, 1.0);
        rawReflectionFacts.environmentSample = sampleOceanFarFieldReflection(rawReflectionFacts.analyticSample, oceanFarReflectionDirection(viewDirection));
        rawReflectionFacts.environmentValidity = material_EnvironmentReflectionAvailable;
        rawReflectionFacts.ssrPremultipliedSample = vec3(0.0);
        rawReflectionFacts.ssrValidity = 0.0;
        WaterSurfaceRawFoamFactsV2 rawFoamFacts;
        rawFoamFacts.surfaceSignal = 0.0;
        rawFoamFacts.shoreSignal = 0.0;
        rawFoamFacts.crestSignal = 0.0;
        rawFoamFacts.currentSignal = 0.0;
        rawFoamFacts.wakeSignal = 0.0;
        rawFoamFacts.contactSignal = 0.0;
        rawFoamFacts.localSignal = 0.0;
        rawFoamFacts.motionScale = 0.0;
        rawFoamFacts.enabled = 0.0;
        WaterSurfaceRawContributionPolicyV2 rawContributionPolicy;
        rawContributionPolicy.primaryColorClosureModel = 3.0;
        rawContributionPolicy.refractionEnabled = 0.0;
        rawContributionPolicy.clarity = 1.0;
        rawContributionPolicy.boundaryRefractionSuppression = 0.0;
        rawContributionPolicy.reflectionSource = 1.0;
        rawContributionPolicy.ssrCompositeIntensity = 0.0;
        rawContributionPolicy.foamIntensity = 0.0;
        WaterSurfaceResolvedRawContributionsV2 contributions = waterSurfaceResolveRawContributionsV2(rawRefractionFacts, rawReflectionFacts, waterSurfaceResolveRawFoamWeightV2(rawFoamFacts, rawContributionPolicy), rawContributionPolicy);
        WaterSurfaceFinalClosureV2Input closureInput;
        closureInput.additionalTransmissionRadiance = vec3(0.0);
        closureInput.primarySceneColor = vec3(0.0);
        closureInput.surfaceColor = baseColor;
        closureInput.depthColor = baseColor;
        closureInput.depthFactor = 1.0;
        closureInput.diffuseLighting = diffuseLighting;
        closureInput.primaryColorClosureModel = 3.0;
        closureInput.absorptionCoefficient = material_AbsorptionCoefficient;
        closureInput.scatteringColor = material_ScatteringColor;
        closureInput.scatteringCoefficient = material_ScatteringCoefficient;
        closureInput.opticalDepth = waterSurface_verticalDepth;
        closureInput.refractionColor = contributions.refractionSceneColor;
        closureInput.refractionWeight = 0.0;
        closureInput.reflectionRadiance = contributions.reflectionRadiance;
        closureInput.fresnelF0 = pow((material_IndexOfRefraction - 1.0) / (material_IndexOfRefraction + 1.0), 2.0);
        // Far mip filtering suppresses unresolved detail; it does not change the material BRDF.
        closureInput.perceptualRoughness = material_Roughness;
        closureInput.normalDotView = oceanFarReflectionNormalDotView(viewDirection);
        closureInput.transmissionFresnelWeight = 1.0;
        closureInput.reflectionIntensity = material_ReflectionIntensity;
        closureInput.directSpecularRadiance = vec3(0.0);
        closureInput.boundaryColor = vec3(0.0);
        closureInput.foamColor = vec3(1.0);
        closureInput.foamWeight = contributions.foamWeight;
        closureInput.baseAlpha = 1.0;
        closureInput.clarity = 1.0;
        closureInput.coastalAlpha = 1.0;
        closureInput.coastalAlphaWeight = 1.0;
        closureInput.coverage = waterSurface_coverage;
        closureInput.compositionSceneColor = vec3(0.0);
        closureInput.precomposedReplace = 1.0;
        return waterSurfaceEvaluateFinalClosureV2(closureInput).rgb;
      }

#endif
