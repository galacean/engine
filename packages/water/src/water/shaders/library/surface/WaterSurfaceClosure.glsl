#ifndef WATER_SURFACE_CLOSURE_INCLUDED
#define WATER_SURFACE_CLOSURE_INCLUDED
vec3 waterSurfaceResolvePrimaryColor(
  vec3 sceneColor,
  vec3 surfaceColor,
  vec3 depthColor,
  float depthFactor,
  vec3 diffuseLighting,
  float closureModel
) {
  if (closureModel > 3.5) {
    return mix(sceneColor, depthColor, clamp(depthFactor, 0.0, 1.0)) * max(diffuseLighting, vec3(0.0));
  }
  vec3 stylized = mix(
    surfaceColor,
    depthColor * max(diffuseLighting, vec3(0.0)),
    clamp(depthFactor, 0.0, 1.0)
  );
  vec3 litScene = mix(
    clamp(sceneColor, vec3(0.0), vec3(1.0)),
    depthColor * max(diffuseLighting, vec3(0.0)),
    clamp(depthFactor, 0.0, 1.0)
  );
  #if {{SCENE_COLOR_COMPOSITE_DEPTH_RAMP_ENABLED}} == 1
    vec3 sceneCompositeWater = mix(
      surfaceColor,
      depthColor,
      clamp(depthFactor, 0.0, 1.0)
    ) * max(diffuseLighting, vec3(0.0));
    return closureModel > 2.5
      ? sceneCompositeWater
      : (closureModel > 1.5
        ? litScene
        : (closureModel > 0.5 ? stylized : surfaceColor));
  #else
    return closureModel > 1.5
      ? litScene
      : (closureModel > 0.5 ? stylized : surfaceColor);
  #endif
}

vec3 waterSurfaceOpticalTransmittance(vec3 absorptionCoefficient, float opticalDepth) {
  return exp(-max(absorptionCoefficient, vec3(0.0)) * max(opticalDepth, 0.0));
}

vec3 waterSurfaceOpticalScattering(
  vec3 scatteringColor,
  float scatteringCoefficient,
  float opticalDepth
) {
  float weight = 1.0 - exp(-max(scatteringCoefficient, 0.0) * max(opticalDepth, 0.0));
  return max(scatteringColor, vec3(0.0)) * weight;
}

vec3 waterSurfaceApplyOpticalVolume(
  vec3 surfaceColor,
  vec3 absorptionCoefficient,
  vec3 scatteringColor,
  float scatteringCoefficient,
  float opticalDepth
) {
  return surfaceColor * waterSurfaceOpticalTransmittance(absorptionCoefficient, opticalDepth)
    + waterSurfaceOpticalScattering(scatteringColor, scatteringCoefficient, opticalDepth);
}

vec4 waterSurfaceComposeFinal(vec3 color, float alpha, float precomposedReplace) {
  return vec4(color, mix(clamp(alpha, 0.0, 1.0), 1.0, step(0.5, precomposedReplace)));
}

float waterSurfaceResolveAlphaV2(
  float baseAlpha,
  float clarity,
  float opticalDepth,
  float fresnel,
  float foamWeight,
  float calibrationMode,
  float coastalAlpha,
  float coastalAlphaWeight
) {
  float absorptionAlpha = 1.0 - exp(-mix(0.48, 0.13, clamp(clarity, 0.0, 1.0)) * max(opticalDepth, 0.0));
  float alpha = baseAlpha * mix(0.18, 0.94, absorptionAlpha);
  alpha += clamp(fresnel, 0.0, 1.0) * (1.0 - alpha) * 0.48;
  alpha += clamp(foamWeight, 0.0, 1.0) * 0.3 * (1.0 - step(0.5, calibrationMode));
  alpha = mix(alpha, coastalAlpha, clamp(coastalAlphaWeight, 0.0, 1.0));
  return clamp(alpha, 0.0, 1.0);
}
#if {{DIRECTIONAL_HIGHLIGHT_ENABLED}} == 1
vec3 waterSurfaceAmplifyMacroNormalSlopes(vec3 macroNormalWS, float strength) {
  vec3 amplified = vec3(
    macroNormalWS.x * max(strength, 0.0),
    macroNormalWS.y,
    macroNormalWS.z * max(strength, 0.0)
  );
  float lengthSquared = dot(amplified, amplified);
  return lengthSquared > 0.00000001
    ? amplified * inversesqrt(lengthSquared)
    : vec3(0.0, 1.0, 0.0);
}

// Vendor-neutral port of the bounded perturbed Blinn-Phong directional highlight.
vec3 waterSurfaceDirectionalHighlightV2(
  vec3 lightRadiance,
  vec3 lightDirectionWS,
  vec3 viewDirectionWS,
  vec3 geometryNormalWS,
  vec3 detailNormalWS,
  float distortion,
  float exponent,
  float strength,
  float sharp
) {
  float safeDistortion = clamp(distortion, 0.0, 2.0);
  vec3 perturbedNormal = normalize(mix(geometryNormalWS, detailNormalWS, safeDistortion));
  vec3 halfVector = normalize(lightDirectionWS + viewDirectionWS + perturbedNormal * safeDistortion);
  float specular = pow(
    clamp(dot(geometryNormalWS, halfVector), 0.0, 1.0),
    max(exponent, 1.0)
  );
  float sharpWeight = step(0.5, sharp);
  specular = mix(specular, step(0.2, specular), sharpWeight);
  float viewFactor = smoothstep(
    0.0,
    0.15,
    clamp(dot(geometryNormalWS, lightDirectionWS), 0.0, 1.0)
  );
  return max(lightRadiance, vec3(0.0))
    * specular
    * max(strength, 0.0)
    * mix(1.0, 0.5, sharpWeight)
  * viewFactor;
}
#endif

struct WaterSurfaceFinalClosureV2Input {
#if {{ADDITIONAL_TRANSMISSION_ENABLED}} == 1
  vec3 additionalTransmissionRadiance;
#endif
#ifdef MATERIAL_WATER_SURFACE_SCATTERING
  vec3 surfaceScatteringCoefficient;
  float surfaceScatteringPhaseG;
  float sceneToSurfaceDistance;
  float phaseCosine;
  vec3 sunRadiance;
  vec3 ambientRadiance;
  float opticalDebugMode;
#endif
  vec3 primarySceneColor;
  vec3 surfaceColor;
  vec3 depthColor;
  float depthFactor;
  vec3 diffuseLighting;
  float primaryColorClosureModel;
  vec3 absorptionCoefficient;
  vec3 scatteringColor;
  float scatteringCoefficient;
  float opticalDepth;
  vec3 refractionColor;
  float refractionWeight;
  vec3 reflectionRadiance;
  float fresnelF0;
  float perceptualRoughness;
  float normalDotView;
  float transmissionFresnelWeight;
  float reflectionIntensity;
  vec3 directSpecularRadiance;
  vec3 boundaryColor;
  vec3 foamColor;
  float foamWeight;
  float baseAlpha;
  float clarity;
  float calibrationMode;
  float coastalAlpha;
  float coastalAlphaWeight;
  float coverage;
  vec3 compositionSceneColor;
  float precomposedReplace;
};

struct WaterSurfaceResolvedLightingV2 {
  vec3 diffuseRadiance;
  vec3 directSpecularRadiance;
};

WaterSurfaceResolvedLightingV2 waterSurfaceCreateResolvedLightingV2(vec3 ambientDiffuseRadiance) {
  WaterSurfaceResolvedLightingV2 lighting;
  lighting.diffuseRadiance = max(ambientDiffuseRadiance, vec3(0.0));
  lighting.directSpecularRadiance = vec3(0.0);
  return lighting;
}

WaterSurfaceResolvedLightingV2 waterSurfaceAccumulateDirectLightingV2(
  WaterSurfaceResolvedLightingV2 lighting,
  vec3 lightRadiance,
  float normalDotView,
  float normalDotLight,
  float normalDotHalf,
  float lightDotHalf,
  float fresnelF0,
  float perceptualRoughness,
  float primaryColorClosureModel,
  float directSpecularEnabled
) {
  vec3 safeLightRadiance = max(lightRadiance, vec3(0.0));
  float safeNormalDotLight = clamp(normalDotLight, 0.0, 1.0);
  float standardDirectSpecular = waterSurfaceDirectSpecular(
    fresnelF0,
    perceptualRoughness,
    normalDotView,
    safeNormalDotLight,
    normalDotHalf,
    lightDotHalf
  );
  float litDirectSpecular = waterSurfaceLitDirectSpecular(
    fresnelF0,
    perceptualRoughness,
    safeNormalDotLight,
    normalDotHalf,
    lightDotHalf
  );
  float resolvedDirectSpecular = mix(
    standardDirectSpecular,
    litDirectSpecular,
    step(1.5, primaryColorClosureModel) * (1.0 - step(3.5, primaryColorClosureModel))
  ) * clamp(directSpecularEnabled, 0.0, 1.0);
  lighting.diffuseRadiance += safeLightRadiance * safeNormalDotLight;
  lighting.directSpecularRadiance += safeLightRadiance * resolvedDirectSpecular;
  return lighting;
}

vec4 waterSurfaceEvaluateFinalClosureV2(
  WaterSurfaceFinalClosureV2Input closure,
  float foamColorWeight,
  float depthOpacity
) {
  float fresnel = waterSurfaceSchlick(
    closure.fresnelF0,
    1.0,
    closure.normalDotView
  );
#ifdef MATERIAL_WATER_SURFACE_SCATTERING
  WaterSingleScatteringResult medium = waterEvaluateSingleScattering(
    closure.absorptionCoefficient, closure.surfaceScatteringCoefficient, closure.surfaceScatteringPhaseG,
    closure.opticalDepth, closure.sceneToSurfaceDistance, closure.phaseCosine,
    closure.sunRadiance, closure.ambientRadiance
  );
  vec3 tint = mix(closure.surfaceColor, closure.depthColor, clamp(closure.depthFactor, 0.0, 1.0));
  vec3 volume = closure.refractionColor * medium.transmittance * medium.lightTransmittance
    + medium.scattering * max(tint, vec3(0.0));
  vec3 reflectionWeight = waterSurfaceEnvironmentSpecularWeight(
    closure.fresnelF0, closure.perceptualRoughness, closure.normalDotView
  );
  vec3 lit = volume * (1.0 - fresnel)
    + closure.reflectionRadiance * reflectionWeight * max(closure.reflectionIntensity, 0.0)
    + closure.directSpecularRadiance
    + closure.boundaryColor * max(closure.diffuseLighting, vec3(0.0));
  lit = mix(lit, closure.foamColor * max(closure.diffuseLighting, vec3(0.0)), clamp(foamColorWeight, 0.0, 1.0));
  if (closure.opticalDebugMode > 13.5 && closure.opticalDebugMode < 14.5) return vec4(medium.transmittance, 1.0);
  if (closure.opticalDebugMode > 14.5 && closure.opticalDebugMode < 15.5) return vec4(medium.scattering, 1.0);
  // The volume already contains the background. Coverage alone blends its geometric boundary.
  return vec4(mix(closure.compositionSceneColor, lit, clamp(closure.coverage, 0.0, 1.0)), 1.0);
#endif
  vec3 primaryColor = waterSurfaceResolvePrimaryColor(
    closure.primarySceneColor,
    closure.surfaceColor,
    closure.depthColor,
    closure.depthFactor,
    closure.diffuseLighting,
    closure.primaryColorClosureModel
  );
  vec3 opticalVolumeColor = waterSurfaceApplyOpticalVolume(
    primaryColor,
    closure.absorptionCoefficient,
    closure.scatteringColor,
    closure.scatteringCoefficient,
    closure.opticalDepth
  );
  vec3 baseColor = mix(
    opticalVolumeColor,
    primaryColor,
    step(0.5, closure.primaryColorClosureModel)
  );
  vec3 refractedVolumeColor = waterSurfaceApplyOpticalVolume(
    closure.refractionColor,
    closure.absorptionCoefficient,
    closure.scatteringColor,
    closure.scatteringCoefficient,
    closure.opticalDepth
  );
  vec3 resolvedRefractionColor = mix(
    refractedVolumeColor,
    closure.refractionColor,
    step(0.5, closure.primaryColorClosureModel)
  );
  vec3 color = mix(
    baseColor,
    resolvedRefractionColor,
    clamp(closure.refractionWeight, 0.0, 1.0) * (1.0 - step(1.5, closure.primaryColorClosureModel))
  );
  vec3 boundaryContribution = closure.boundaryColor * max(closure.diffuseLighting, vec3(0.0));
  float litSceneColorClosure = step(1.5, closure.primaryColorClosureModel);
  color += boundaryContribution * litSceneColorClosure;
  #if {{ADDITIONAL_TRANSMISSION_ENABLED}} == 1
    color += closure.additionalTransmissionRadiance;
  #endif
  #if {{ROUGH_TRANSMISSION_ENABLED}} == 1
    // Match the energy removed from a rough transmitted lobe to its integrated
    // environment BRDF; smooth Schlick would blacken a rough grazing horizon.
    float transmissionFresnel = clamp(waterSurfaceEnvironmentSpecularWeight(
      closure.fresnelF0, closure.perceptualRoughness, closure.normalDotView
    ).x, 0.0, 1.0);
  #endif
  color *= mix(
    1.0,
    1.0 - {{TRANSMISSION_FRESNEL}},
    clamp(closure.transmissionFresnelWeight, 0.0, 1.0)
  );
  vec3 reflectionBrdfWeight = waterSurfaceEnvironmentSpecularWeight(
    closure.fresnelF0,
    closure.perceptualRoughness,
    closure.normalDotView
  );
  color += closure.reflectionRadiance
    * reflectionBrdfWeight
    * max(closure.reflectionIntensity, 0.0);
  color += closure.directSpecularRadiance;
  color += boundaryContribution * (1.0 - litSceneColorClosure);
  vec3 litFoamColor = closure.foamColor * max(closure.diffuseLighting, vec3(0.0));
  color = mix(color, litFoamColor, clamp(foamColorWeight, 0.0, 1.0));
  #if {{SCENE_COLOR_COMPOSITE_DEPTH_RAMP_ENABLED}} == 1
    float sceneColorCompositeClosure = step(2.5, closure.primaryColorClosureModel) * (1.0 - step(3.5, closure.primaryColorClosureModel));
    float sceneCompositeWeight = clamp(
      closure.depthFactor * clamp(depthOpacity, 0.0, 1.0) + foamColorWeight,
      0.0,
      1.0
    ) * clamp(closure.coverage, 0.0, 1.0);
    color = mix(
      color,
      mix(closure.primarySceneColor, color, sceneCompositeWeight),
      sceneColorCompositeClosure
    );
  #endif

  float alpha = waterSurfaceResolveAlphaV2(
    closure.baseAlpha,
    closure.clarity,
    closure.opticalDepth,
    fresnel,
    closure.foamWeight,
    closure.calibrationMode,
    closure.coastalAlpha,
    closure.coastalAlphaWeight
  ) * clamp(closure.coverage, 0.0, 1.0);
  float replace = step(0.5, closure.precomposedReplace);
  #if {{SCENE_COLOR_COMPOSITE_DEPTH_RAMP_ENABLED}} == 1
    color = mix(
      color,
      mix(closure.compositionSceneColor, color, alpha),
      replace * (1.0 - sceneColorCompositeClosure)
    );
  #else
    color = mix(color, mix(closure.compositionSceneColor, color, alpha), replace);
  #endif
  return waterSurfaceComposeFinal(color, alpha, replace);
}

// Existing backends retain their opaque depth colors unless they supply depth opacity.
vec4 waterSurfaceEvaluateFinalClosureV2(WaterSurfaceFinalClosureV2Input closure, float foamColorWeight) {
  return waterSurfaceEvaluateFinalClosureV2(closure, foamColorWeight, 1.0);
}

vec4 waterSurfaceEvaluateFinalClosureV2(WaterSurfaceFinalClosureV2Input closure) {
  return waterSurfaceEvaluateFinalClosureV2(closure, closure.foamWeight);
}

// Shared editor picking output; normal rendering retains the resolved optical closure.
#ifdef RENDERER_WORLD_PICK
float renderer_WorldPickBase;
#endif
float renderer_WorldSelectionMode;
vec4 renderer_WorldSelectionAppearance;
vec4 waterSurfaceOutputWithPick(vec4 color) {
#ifdef RENDERER_WORLD_PICK
  if (color.a <= 0.001) discard;
  float id = floor(renderer_WorldPickBase + 0.5);
  #ifdef RENDERER_WORLD_PICK_DEPTH
    id = floor(gl_FragCoord.z * 16777215.0 + 0.5);
  #endif
  return vec4(mod(id, 256.0), mod(floor(id / 256.0), 256.0), floor(id / 65536.0), 255.0) / 255.0;
#else
  if (renderer_WorldSelectionMode >= 0.5) {
    vec2 p = gl_FragCoord.xy * renderer_WorldSelectionAppearance.yz * 2.0;
    float phase = renderer_WorldSelectionAppearance.x * 6.2831853;
    // Smooth warped colour pools instead of parallel rainbow stripes. Exact 2.4s loop.
    float field = p.y * 3.0 + sin(p.x * 4.0 + p.y * 2.0) * 0.7;
    float flow = field + phase + 0.24 * sin(phase + p.x * 5.0);
    // Match the saturated spectrum used by generation reveal effects.
    vec3 film = 0.54 + 0.46 * cos(flow + 6.2831853 * vec3(0.03, 0.36, 0.69));
    float sheen = pow(0.5 + 0.5 * sin(flow + p.x * 1.4), 8.0);
    // HDR emission feeds the existing scene Bloom before tonemapping.
    vec3 highlighted = mix(color.rgb, film, 0.82) + film * (1.2 + sheen * 0.8);
    // Fade the entire highlight, including HDR emission, back to the live material.
    float breath = 0.5 - 0.5 * cos(phase);
    color.rgb = mix(color.rgb, highlighted, renderer_WorldSelectionAppearance.w * breath);
  }
  return color;
#endif
}

#endif
