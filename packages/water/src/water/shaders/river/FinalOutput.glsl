{
        vec3 waterColor = color;
        WaterSurfaceResolvedLightingV2 resolvedLighting = waterSurfaceCreateResolvedLightingV2(waterSurfaceAmbientDiffuseRadiance(input.macroNormalWS));
        resolvedLighting = waterSurfaceAccumulateDirectLightingV2(
          resolvedLighting,
          sunlightColor,
          normalDotView,
          normalDotLight,
          normalDotHalf,
          lightDotHalf,
          fresnelF0,
          effectiveSurfaceRoughness,
          {{VALUE_003_PRIMARYCOLORCLOSUREMODEL}},
          material_AppearanceDirectSpecularEnabled
        );
        vec3 waterDiffuseLighting = max(resolvedLighting.diffuseRadiance, vec3(0.0));
        float coverage = shoreDamping;
        float material_Alpha = 1.0;
        float material_OpticsCalibrationMode = 0.0;
        float depthRatio = saturate(
          opticalDepth / max(material_MaximumSurfaceOpticalDistance, 0.0001)
        );
{{VALUE_004_CREATEWATERSURFACEAPPEARANCEV2DEPTHRESPONSESTATEMENT}}
        WaterSurfaceRawRefractionFactsV2 rawRefractionFacts;
        rawRefractionFacts.centeredSceneSample = centeredSceneColor;
        rawRefractionFacts.displacedSceneSample = displacedSceneColor;
        rawRefractionFacts.displacedSampleValidity = refractionSampleWeight;
        rawRefractionFacts.depthWeight = refractionDepthWeight;
        rawRefractionFacts.shoreValidity = shoreDamping;
        rawRefractionFacts.coverage = shoreDamping;
        WaterSurfaceRawReflectionFactsV2 rawReflectionFacts;
        rawReflectionFacts.analyticSample = rawAnalyticReflectionSample;
        rawReflectionFacts.environmentSample = rawEnvironmentReflectionSample;
        rawReflectionFacts.environmentValidity = rawEnvironmentReflectionValidity;
        rawReflectionFacts.ssrPremultipliedSample = rawSsrReflectionPremultipliedSample;
        rawReflectionFacts.ssrValidity = rawSsrReflectionValidity;
        WaterSurfaceRawFoamFactsV2 rawFoamFacts;
        rawFoamFacts.surfaceSignal = 0.0;
        rawFoamFacts.shoreSignal = shoreFoam;
        rawFoamFacts.crestSignal = crestFoam;
        rawFoamFacts.currentSignal = currentFoam;
        rawFoamFacts.wakeSignal = max(max(localConfluenceFoam, localWakeFoam), obstacleEdgeFoam);
        rawFoamFacts.contactSignal = contactFoamMask;
        rawFoamFacts.localSignal = 0.0;
        rawFoamFacts.motionScale = 1.0;
        rawFoamFacts.enabled = 1.0;
        WaterSurfaceRawContributionPolicyV2 rawContributionPolicy;
        rawContributionPolicy.primaryColorClosureModel = {{VALUE_005_PRIMARYCOLORCLOSUREMODEL}};
        rawContributionPolicy.refractionEnabled = step(0.5, material_RefractionEnabled) * {{VALUE_006_REFRACTIONENABLED}};
        rawContributionPolicy.clarity = clarity;
        rawContributionPolicy.boundaryRefractionSuppression = appearanceBoundaryRefractionSuppression;
        rawContributionPolicy.reflectionSource = material_ReflectionSource;
        rawContributionPolicy.ssrCompositeIntensity = material_WaterScreenSpaceReflectionCompositeIntensity;
        rawContributionPolicy.foamIntensity = material_FoamIntensity;
        rawContributionPolicy.calibrationMode = 0.0;
        WaterSurfaceResolvedRawContributionsV2 resolvedContributions = waterSurfaceResolveRawContributionsV2(
          rawRefractionFacts,
          rawReflectionFacts,
          rawFoamFacts,
          rawContributionPolicy
        );
        WaterSurfaceFinalClosureV2Input closureInput;
#ifdef MATERIAL_WATER_SURFACE_SCATTERING
        closureInput.surfaceScatteringCoefficient = material_SurfaceScatteringCoefficient;
        closureInput.surfaceScatteringPhaseG = material_SurfaceScatteringPhaseG;
        closureInput.sceneToSurfaceDistance = max(input.worldPosition.y - refractedOpaquePositionWS.y, 0.0);
        vec3 volumeRayDirection = safeNormalize3(refract(-viewDirection, surfaceNormalWS, 1.0 / max(material_IndexOfRefraction, 1.0)), -viewDirection);
        closureInput.phaseCosine = dot(lightDirection, volumeRayDirection);
        closureInput.sunRadiance = sunlightColor;
        closureInput.ambientRadiance = waterSurfaceAmbientDiffuseRadiance(input.macroNormalWS);
        closureInput.opticalDebugMode = material_SurfaceDebugMode;
#endif
        closureInput.primarySceneColor = resolvedContributions.refractionSceneColor;
        closureInput.surfaceColor = {{VALUE_007_SURFACECOLOR}};
        closureInput.depthColor = appearanceDepthTintColor;
        closureInput.depthFactor = appearanceDepthTintFactor
          * {{VALUE_008_WATER_SURFACE_APPEARANCE_V2_SHADER_PROPERTY_DEPTHRES}};
        closureInput.diffuseLighting = waterDiffuseLighting;
        closureInput.primaryColorClosureModel = {{VALUE_009_PRIMARYCOLORCLOSUREMODEL}};
        closureInput.absorptionCoefficient = material_AbsorptionCoefficient;
        closureInput.scatteringColor = material_ScatteringColor;
        closureInput.scatteringCoefficient = material_ScatteringCoefficient;
        closureInput.opticalDepth = opticalDepth;
        closureInput.refractionColor = resolvedContributions.refractionSceneColor;
        closureInput.refractionWeight = resolvedContributions.refractionWeight;
        closureInput.reflectionRadiance = resolvedContributions.reflectionRadiance;
        closureInput.fresnelF0 = fresnelF0;
        closureInput.perceptualRoughness = effectiveSurfaceRoughness;
        closureInput.normalDotView = normalDotView;
        closureInput.transmissionFresnelWeight = {{VALUE_010_LITSCENECOLORCLOSURE_1_0_0_0}};
        closureInput.reflectionIntensity = reflectionIntensity;
        closureInput.directSpecularRadiance = resolvedLighting.directSpecularRadiance;
        closureInput.boundaryColor = appearanceBoundaryColor;
        closureInput.foamColor = material_FoamColor.rgb;
        closureInput.foamWeight = resolvedContributions.foamWeight;
        closureInput.baseAlpha = material_Alpha;
        closureInput.clarity = clarity;
        closureInput.calibrationMode = material_OpticsCalibrationMode;
        {{VALUE_011_CREATEWATERSURFACEAPPEARANCEV2ALPHAINPUTASSIGNMENTS_}}
        closureInput.coverage = shoreDamping;
        closureInput.compositionSceneColor = centeredSceneColor;
        closureInput.precomposedReplace = {{VALUE_012_COMPOSITION}};
        #ifdef MATERIAL_WATER_CONNECTIONS
        // Both sides approach clear, flat water before their authored optical response resumes.
        float connectionWeight = waterConnectionFacts(input.worldPosition.xz).x;
        closureInput.depthFactor *= connectionWeight;
        closureInput.opticalDepth *= connectionWeight;
        closureInput.directSpecularRadiance *= connectionWeight;
        closureInput.perceptualRoughness = mix(0.1, closureInput.perceptualRoughness, connectionWeight);
#endif
        {{VALUE_013_CREATEWATERSURFACEV2EVALUATIONSTATEMENT_RESOLVEDWATE}}
        if (material_SurfaceDebugMode > {{VALUE_014_RIVERSURFACEDEBUGMODE_OFF_0_5}} && (material_SurfaceDebugMode < 13.5 || material_SurfaceDebugMode > 15.5)) {
          resolvedWaterClosure = vec4(color, 1.0);
        }
        #ifdef SSR_CONTRIBUTION_CAPTURE
          if (resolvedWaterClosure.a <= 0.0001) discard;
        #endif
        #ifndef SSR_CONTRIBUTION_DEPTH
          {{VALUE_015_CREATEWATERSURFACEV2RESOLVEDOUTPUTSTATEMENT_RESOLVED}}
        #endif
        }
