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
        WaterSurfaceRawContributionPolicyV2 rawContributionPolicy;
        rawContributionPolicy.primaryColorClosureModel = {{VALUE_001_PRIMARYCOLORCLOSUREMODEL}};
        rawContributionPolicy.refractionEnabled = step(0.5, material_RefractionEnabled) * {{VALUE_002_REFRACTIONENABLED}};
        rawContributionPolicy.clarity = clarity;
        rawContributionPolicy.boundaryRefractionSuppression = appearanceBoundaryRefractionSuppression;
        rawContributionPolicy.reflectionSource = material_ReflectionSource;
        rawContributionPolicy.ssrCompositeIntensity = material_WaterScreenSpaceReflectionCompositeIntensity;
        WaterSurfaceResolvedRawContributionsV2 resolvedContributions = waterSurfaceResolveRawContributionsV2(
          rawRefractionFacts,
          rawReflectionFacts,
          contactFoamMask,
          rawContributionPolicy
        );
        WaterSurfaceFinalClosureV2Input closureInput;
        closureInput.primarySceneColor = resolvedContributions.refractionSceneColor;
        closureInput.surfaceColor = {{VALUE_003_SURFACECOLOR}};
        closureInput.depthColor = appearanceDepthTintColor;
        closureInput.depthFactor = appearanceDepthTintFactor
          * {{VALUE_004_WATER_SURFACE_APPEARANCE_V2_SHADER_PROPERTY_DEPTHRES}};
        closureInput.diffuseLighting = waterDiffuseLighting;
        closureInput.primaryColorClosureModel = {{VALUE_005_PRIMARYCOLORCLOSUREMODEL}};
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
        closureInput.transmissionFresnelWeight = {{VALUE_006_LITSCENECOLORCLOSURE_1_0_0_0}};
        closureInput.reflectionIntensity = reflectionIntensity;
        closureInput.directSpecularRadiance = directSpecularRadiance;
        closureInput.boundaryColor = appearanceBoundaryColor;
        closureInput.foamColor = appearanceBoundaryColor / max(contactFoamMask, 0.0001);
        closureInput.foamWeight = resolvedContributions.foamWeight;
        closureInput.baseAlpha = material_Alpha;
        closureInput.clarity = clarity;
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