        WaterSurfaceRawRefractionFactsV2 rawRefractionFacts;
        rawRefractionFacts.centeredSceneSample = centeredOpaqueColor;
        rawRefractionFacts.displacedSceneSample = displacedOpaqueColor;
        rawRefractionFacts.displacedSampleValidity = refractionSampleValidity;
        rawRefractionFacts.depthWeight = refractionDepthWeight;
        rawRefractionFacts.shoreValidity = refractionShoreWeight;
        rawRefractionFacts.coverage = coverage;
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
        rawFoamFacts.wakeSignal = wakeFoam;
        rawFoamFacts.contactSignal = contactFoamMask;
        rawFoamFacts.localSignal = localFoamMask;
        rawFoamFacts.motionScale = foamMotionScale;
        rawFoamFacts.enabled = material_FoamEnabled;
        WaterSurfaceRawContributionPolicyV2 rawContributionPolicy;
        rawContributionPolicy.primaryColorClosureModel = {{VALUE_001_PRIMARYCOLORCLOSUREMODEL}};
        rawContributionPolicy.refractionEnabled = step(0.5, material_RefractionEnabled) * {{VALUE_002_REFRACTIONENABLED}};
        rawContributionPolicy.clarity = clarity;
        rawContributionPolicy.boundaryRefractionSuppression = appearanceBoundaryRefractionSuppression;
        rawContributionPolicy.reflectionSource = material_ReflectionSource;
        rawContributionPolicy.ssrCompositeIntensity = material_WaterScreenSpaceReflectionCompositeIntensity;
        rawContributionPolicy.foamIntensity = material_FoamIntensity;
        rawContributionPolicy.calibrationMode = material_OpticsCalibrationMode;
        WaterSurfaceResolvedRawContributionsV2 resolvedContributions = waterSurfaceResolveRawContributionsV2(
          rawRefractionFacts,
          rawReflectionFacts,
          rawFoamFacts,
          rawContributionPolicy
        );
        WaterSurfaceFinalClosureV2Input closureInput;
        closureInput.primarySceneColor = resolvedContributions.refractionSceneColor;
        closureInput.surfaceColor = mix(
          {{VALUE_003_SURFACECOLOR}},
          resolvedContributions.refractionSceneColor,
          step(0.5, material_OpticsCalibrationMode)
        );
        closureInput.depthColor = appearanceDepthTintColor;
        closureInput.depthFactor = appearanceDepthTintFactor
          * {{VALUE_004_WATER_SURFACE_APPEARANCE_V2_SHADER_PROPERTY_DEPTHRES}};
        closureInput.diffuseLighting = waterDiffuseLighting;
        closureInput.primaryColorClosureModel = mix(
          {{VALUE_005_PRIMARYCOLORCLOSUREMODEL}},
          0.0,
          step(0.5, material_OpticsCalibrationMode)
        );
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
        closureInput.transmissionFresnelWeight = max(
          {{VALUE_006_LITSCENECOLORCLOSURE_1_0_0_0}},
          step(0.5, material_OpticsCalibrationMode)
        );
        closureInput.reflectionIntensity = reflectionIntensity;
        closureInput.directSpecularRadiance = material_OpticsCalibrationMode < 0.5
          ? directSpecularRadiance
          : vec3(0.0);
        closureInput.boundaryColor = material_OpticsCalibrationMode < 0.5
          ? appearanceBoundaryColor
          : vec3(0.0);
        closureInput.foamColor = material_FoamColor.rgb;
        closureInput.foamWeight = resolvedContributions.foamWeight;
        closureInput.baseAlpha = material_Alpha;
        closureInput.clarity = clarity;
        closureInput.calibrationMode = material_OpticsCalibrationMode;
        {{VALUE_007_CREATEWATERSURFACEAPPEARANCEV2ALPHAINPUTASSIGNMENTS_}}
        closureInput.coverage = coverage;
        closureInput.compositionSceneColor = centeredOpaqueColor;
        closureInput.precomposedReplace = {{VALUE_008_COMPOSITION}};
        #ifdef MATERIAL_WATER_CONNECTIONS
        // Both sides approach clear, flat water before their authored optical response resumes.
        float connectionWeight = waterConnectionFacts(input.worldPosition.xz).x;
        closureInput.depthFactor *= connectionWeight;
        closureInput.opticalDepth *= connectionWeight;
        closureInput.directSpecularRadiance *= connectionWeight;
        closureInput.perceptualRoughness = mix(0.1, closureInput.perceptualRoughness, connectionWeight);
#endif
        {{VALUE_009_CREATEWATERSURFACEV2EVALUATIONSTATEMENT_RESOLVEDWATE}}