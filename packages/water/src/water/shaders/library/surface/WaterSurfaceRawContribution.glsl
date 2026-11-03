#ifndef WATER_SURFACE_RAW_CONTRIBUTION_INCLUDED
#define WATER_SURFACE_RAW_CONTRIBUTION_INCLUDED

struct WaterSurfaceRawRefractionFactsV2 {
  vec3 centeredSceneSample;
  vec3 displacedSceneSample;
  float displacedSampleValidity;
  float depthWeight;
  float shoreValidity;
  float coverage;
};

struct WaterSurfaceRawReflectionFactsV2 {
  vec3 analyticSample;
  vec3 environmentSample;
  float environmentValidity;
  vec3 ssrPremultipliedSample;
  float ssrValidity;
};

struct WaterSurfaceRawFoamFactsV2 {
  float surfaceSignal;
  float shoreSignal;
  float crestSignal;
  float currentSignal;
  float wakeSignal;
  float contactSignal;
  float localSignal;
  float motionScale;
  float enabled;
};

struct WaterSurfaceRawContributionPolicyV2 {
  float primaryColorClosureModel;
  float refractionEnabled;
  float clarity;
  float boundaryRefractionSuppression;
  float reflectionSource;
  float ssrCompositeIntensity;
  float foamIntensity;
  float calibrationMode;
};

struct WaterSurfaceResolvedRawContributionsV2 {
  vec3 refractionSceneColor;
  float refractionWeight;
  vec3 reflectionRadiance;
  float foamWeight;
};

void waterSurfaceSampleRawEnvironmentReflectionV2(
  vec3 directionWS,
  vec3 positionWS,
  float perceptualRoughness,
  out vec3 radiance,
  out float validity
) {
  radiance = vec3(0.0);
  validity = 0.0;
  if (material_EnvironmentReflectionAvailable > 0.5) {
    radiance = sampleWaterDistantEnvironmentReflection(
      directionWS,
      positionWS,
      perceptualRoughness
    );
    validity = 1.0;
  }
  #ifdef MATERIAL_WATER_LOCAL_ENVIRONMENT_REFLECTION
    if (material_LocalEnvironmentReflectionAvailable > 0.5) {
      float localWeight = waterLocalEnvironmentWeight(positionWS);
      if (localWeight > 0.0) {
        vec3 localRadiance = sampleWaterLocalEnvironmentReflection(
          directionWS,
          positionWS,
          perceptualRoughness
        );
        if (validity > 0.5) {
          radiance = mix(radiance, localRadiance, localWeight);
        } else {
          radiance = localRadiance;
          validity = localWeight;
        }
      }
    }
  #endif
}

vec3 waterSurfaceResolveAnalyticReflectionFallbackV2(
  float normalY,
  float perceptualRoughness,
  float environmentIntensity
) {
  return mix(
    vec3(0.075, 0.16, 0.21),
    vec3(0.32, 0.48, 0.57),
    mix(
      clamp(normalY * 0.5 + 0.5, 0.0, 1.0),
      0.5,
      clamp(perceptualRoughness, 0.0, 1.0)
    )
  ) * max(environmentIntensity, 0.0);
}

WaterSurfaceResolvedRawContributionsV2 waterSurfaceResolveRawContributionsV2(
  WaterSurfaceRawRefractionFactsV2 refraction,
  WaterSurfaceRawReflectionFactsV2 reflection,
  WaterSurfaceRawFoamFactsV2 foam,
  WaterSurfaceRawContributionPolicyV2 policy
) {
  WaterSurfaceResolvedRawContributionsV2 resolved;
  float proceduralSignal = max(
    max(
      max(foam.surfaceSignal, foam.shoreSignal),
      foam.crestSignal * 0.68 + foam.currentSignal * 0.32
    ),
    foam.wakeSignal
  ) * max(foam.motionScale, 0.0);
  float foamSignal = clamp(
    max(
      max(proceduralSignal, 0.0) * max(policy.foamIntensity, 0.0),
      max(foam.localSignal, 0.0)
    )
      * step(0.5, foam.enabled)
      * (1.0 - step(0.5, policy.calibrationMode)),
    0.0,
    1.0
  );
  resolved.foamWeight = max(
    smoothstep(0.02, 0.78, foamSignal),
    clamp(foam.contactSignal, 0.0, 1.0)
  );

  float displacedValidity = clamp(
    refraction.displacedSampleValidity
      * step(0.5, policy.refractionEnabled),
    0.0,
    1.0
  );
  resolved.refractionSceneColor = mix(
    refraction.centeredSceneSample,
    refraction.displacedSceneSample,
    displacedValidity
  );
  resolved.refractionWeight = clamp(
    (1.0 - step(1.5, policy.primaryColorClosureModel))
      * displacedValidity
      * clamp(refraction.depthWeight, 0.0, 1.0)
      * clamp(refraction.shoreValidity, 0.0, 1.0)
      * clamp(refraction.coverage, 0.0, 1.0)
      * clamp(policy.clarity, 0.0, 1.0)
      * (1.0 - resolved.foamWeight * 0.94)
      * (1.0 - clamp(policy.boundaryRefractionSuppression, 0.0, 1.0)),
    0.0,
    1.0
  );

  vec3 environment = mix(
    reflection.analyticSample,
    reflection.environmentSample,
    clamp(reflection.environmentValidity, 0.0, 1.0)
  );
  resolved.reflectionRadiance = reflection.analyticSample;
  if (policy.reflectionSource > 2.5) {
    float ssrScale = clamp(policy.ssrCompositeIntensity, 0.0, 1.0);
    float ssrBlend = clamp(reflection.ssrValidity * ssrScale, 0.0, 1.0);
    resolved.reflectionRadiance =
      environment * (1.0 - ssrBlend)
      + reflection.ssrPremultipliedSample * ssrScale;
  } else if (policy.reflectionSource > 0.5) {
    resolved.reflectionRadiance = environment;
  }
  return resolved;
}

#endif
