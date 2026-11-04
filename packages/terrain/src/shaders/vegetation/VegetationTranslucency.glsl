#ifndef TERRAIN_PROJECT_VEGETATION_TRANSLUCENCY_INCLUDED
#define TERRAIN_PROJECT_VEGETATION_TRANSLUCENCY_INCLUDED

// Keep this selection aligned with the World Engine overlay's Light.glsl.
// SCENE_USE_REALTIME_SH replaces scene_EnvSH with the GPU-authored realtime SH
// interface, so the compiled Gallery bundle must come from the same overlay.
vec3 terrainProjectVegetationDiffuseIrradiance(vec3 normalWS) {
  #ifdef SCENE_USE_SH
    #ifdef SCENE_USE_REALTIME_SH
      return getRealtimeLightProbeIrradiance(normalWS);
    #else
      return getLightProbeIrradiance(scene_EnvSH, normalWS);
    #endif
  #else
    return scene_EnvMapLight.diffuse * PI;
  #endif
}

vec3 terrainProjectEvaluateVegetationTransmission(
  vec3 geometryNormal,
  vec3 worldPosition,
  float sourcePositionY,
  vec3 viewDirection,
  vec3 albedoColor,
  float shadowAttenuation,
  float ambientVisibility
) {
  vec3 transmission = vec3(0.0);
  vec3 translucencyTint = material_TranslucencyColor.rgb;
  #if defined(MATERIAL_VEGETATION_CLIMATE_LEAF)
    float leafSnow = terrainProjectVegetationLeafSnowMask(sourcePositionY);
    vec3 snowTranslucency = scene_SurfaceSnowColor.rgb * vec3(0.24, 0.3, 0.38);
    translucencyTint = mix(translucencyTint, snowTranslucency, leafSnow);
  #elif defined(MATERIAL_VEGETATION_CLIMATE_SHRUB)
    float shrubSnow = terrainProjectVegetationShrubSnowMask(worldPosition, geometryNormal);
    vec3 snowTranslucency = scene_SurfaceSnowColor.rgb * vec3(0.24, 0.3, 0.38);
    translucencyTint = mix(translucencyTint, snowTranslucency, shrubSnow);
  #endif

  #ifdef MATERIAL_VEGETATION_CLIMATE_LEAF
    vec3 normalizedGeometryNormal = normalize(geometryNormal);
    vec3 normalizedViewDirection = normalize(viewDirection);
    vec3 directTransmission = vec3(0.0);
    #if defined(SCENE_DIRECT_LIGHT_COUNT) && SCENE_DIRECT_LIGHT_COUNT > 0
      for (int lightIndex = 0; lightIndex < SCENE_DIRECT_LIGHT_COUNT; lightIndex++) {
        if (!isRendererCulledByLight(renderer_Layer.xy, scene_DirectLightCullingMask[lightIndex])) {
          #ifdef GRAPHICS_API_WEBGL2
            DirectLight directionalLight = getDirectLight(lightIndex);
          #else
            DirectLight directionalLight;
            directionalLight.color = scene_DirectLightColor[lightIndex];
            directionalLight.direction = scene_DirectLightDirection[lightIndex];
          #endif
          vec3 incidentDirection = normalize(-directionalLight.direction);
          vec3 distortedLightDirection = normalize(
            incidentDirection +
              normalizedGeometryNormal * clamp(material_TranslucencyNormalDistortion, 0.0, 1.0)
          );
          float viewAlignedScattering = pow(
            clamp(dot(normalizedViewDirection, -distortedLightDirection), 0.0, 1.0),
            clamp(material_TranslucencyScattering, 1.0, 50.0)
          );
          float lightShadowAttenuation = lightIndex == 0 ? shadowAttenuation : 1.0;
          float visibility = mix(
            1.0,
            lightShadowAttenuation,
            clamp(material_TranslucencyShadowStrength, 0.0, 1.0)
          );
          directTransmission += directionalLight.color * visibility * viewAlignedScattering;
        }
      }
    #endif
    directTransmission *= clamp(material_TranslucencyDirect, 0.0, 1.0);
    vec3 environmentIrradiance = terrainProjectVegetationDiffuseIrradiance(
      -normalizedGeometryNormal
    ) * scene_EnvMapLight.diffuseIntensity * RECIPROCAL_PI;
    vec3 environmentTransmission = environmentIrradiance *
      clamp(material_TranslucencyAmbient, 0.0, 1.0);
    #ifdef MATERIAL_PROCEDURAL_TREE_CANOPY_OCCLUSION
      environmentTransmission *= mix(
        vec3(1.0),
        material_ProceduralTreeCanopyOcclusionColor.rgb,
        1.0 - clamp(ambientVisibility, 0.0, 1.0)
      );
    #endif
    float translucencyAO = mix(
      1.0,
      clamp(ambientVisibility, 0.0, 1.0),
      clamp(material_TranslucencyAOInfluence, 0.0, 1.0)
    );
    vec3 transmittedSurface = albedoColor * translucencyTint *
      max(material_TranslucencyIntensity, 0.0) * translucencyAO;
    transmission = transmittedSurface * (directTransmission + environmentTransmission);
  #else
    #if defined(SCENE_DIRECT_LIGHT_COUNT) && SCENE_DIRECT_LIGHT_COUNT > 0
      if (!isRendererCulledByLight(renderer_Layer.xy, scene_DirectLightCullingMask[0])) {
        #ifdef GRAPHICS_API_WEBGL2
          DirectLight directionalLight = getDirectLight(0);
        #else
          DirectLight directionalLight;
          directionalLight.color = scene_DirectLightColor[0];
          directionalLight.direction = scene_DirectLightDirection[0];
        #endif
        vec3 incidentDirection = normalize(-directionalLight.direction);
        float visibility = mix(1.0, shadowAttenuation, clamp(material_TranslucencyShadowStrength, 0.0, 1.0));
        float normalWrap = max(material_TranslucencyNormalWrap, 0.0);
        float wrappedBackLighting = clamp(
          (-dot(normalize(geometryNormal), incidentDirection) + normalWrap) / (1.0 + normalWrap),
          0.0,
          1.0
        );
        float transmissionCutoff = clamp(material_TranslucencyBacklightThreshold, 0.0, 0.999);
        wrappedBackLighting = clamp(
          (wrappedBackLighting - transmissionCutoff) / (1.0 - transmissionCutoff),
          0.0,
          1.0
        );
        float transmissionStrength = 1.0 - exp(
          -max(material_TranslucencyIntensity * material_TranslucencyEnergyScale, 0.0)
        );
        vec3 directTransmission =
          wrappedBackLighting * visibility * directionalLight.color * albedoColor *
            translucencyTint * transmissionStrength;
        // The engine resolves static SH, realtime SH, probe volumes, and the diffuse
        // environment fallback behind this function. The Lambert factor keeps this
        // separate transmission lobe on the same irradiance scale as diffuse PBR.
        vec3 environmentIrradiance = terrainProjectVegetationDiffuseIrradiance(
          -normalize(geometryNormal)
        ) * scene_EnvMapLight.diffuseIntensity * RECIPROCAL_PI;
        vec3 environmentTransmission = environmentIrradiance * albedoColor *
          translucencyTint * transmissionStrength * clamp(ambientVisibility, 0.0, 1.0);
        #ifdef MATERIAL_PROCEDURAL_TREE_CANOPY_OCCLUSION
          environmentTransmission *= mix(
            vec3(1.0),
            material_ProceduralTreeCanopyOcclusionColor.rgb,
            1.0 - clamp(ambientVisibility, 0.0, 1.0)
          );
        #endif
        transmission = directTransmission + environmentTransmission;
      }
    #endif
  #endif
  return transmission;
}

#endif
