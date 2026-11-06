#ifndef TERRAIN_PROJECT_TOON_DIFFUSE_LIGHTING_INCLUDED
#define TERRAIN_PROJECT_TOON_DIFFUSE_LIGHTING_INCLUDED

#ifdef MATERIAL_TOON_BAND_FEATHER
  float material_Feather;
#endif

struct TerrainProjectToonDiffuseLighting {
  float value;
  float middleBand;
  float highlightBand;
  vec3 directDiffuse;
  vec3 environmentDiffuse;
};

vec3 terrainProjectToonEnvironmentDiffuse(vec3 normalWS) {
  vec3 irradiance;
  #ifdef SCENE_USE_SH
    #ifdef SCENE_USE_REALTIME_SH
      irradiance = getRealtimeLightProbeIrradiance(normalize(normalWS));
    #else
      vec3 normal = normalize(normalWS);
      irradiance = scene_EnvSH[0] +
        scene_EnvSH[1] * normal.y +
        scene_EnvSH[2] * normal.z +
        scene_EnvSH[3] * normal.x +
        scene_EnvSH[4] * (normal.y * normal.x) +
        scene_EnvSH[5] * (normal.y * normal.z) +
        scene_EnvSH[6] * (3.0 * normal.z * normal.z - 1.0) +
        scene_EnvSH[7] * (normal.z * normal.x) +
        scene_EnvSH[8] * (normal.x * normal.x - normal.y * normal.y);
      irradiance = max(irradiance, vec3(0.0));
    #endif
  #else
    irradiance = max(scene_EnvMapLight.diffuse, vec3(0.0)) * PI;
  #endif
  return irradiance * max(scene_EnvMapLight.diffuseIntensity, 0.0) * RECIPROCAL_PI;
}

float terrainProjectToonBand(float value, float threshold) {
  #ifdef MATERIAL_TOON_BAND_FEATHER
    float feather = max(material_Feather, 0.0001);
    return smoothstep(threshold - feather, threshold + feather, value);
  #else
    return step(threshold, value);
  #endif
}

TerrainProjectToonDiffuseLighting terrainProjectEvaluateToonDiffuseLighting(
  vec3 normalWS,
  float shadowAttenuation,
  float shadowStep,
  float highlightStep
) {
  TerrainProjectToonDiffuseLighting result;
  vec3 directDiffuse = vec3(0.0);
  float weightedDiffuse = 0.0;
  float totalLightWeight = 0.0;
  vec3 normal = normalize(normalWS);

  #ifdef SCENE_DIRECT_LIGHT_COUNT
    for (int lightIndex = 0; lightIndex < SCENE_DIRECT_LIGHT_COUNT; lightIndex++) {
      if (!isRendererCulledByLight(renderer_Layer.xy, scene_DirectLightCullingMask[lightIndex])) {
        DirectLight directLight = getDirectLight(lightIndex);
        vec3 lightColor = max(directLight.color, vec3(0.0));
        float lightWeight = dot(lightColor, vec3(0.2126, 0.7152, 0.0722));
        float visibility = lightIndex == 0 ? shadowAttenuation : 1.0;
        float diffuse = clamp(dot(normal, -normalize(directLight.direction)), 0.0, 1.0) * visibility;
        directDiffuse += lightColor * diffuse;
        weightedDiffuse += diffuse * lightWeight;
        totalLightWeight += lightWeight;
      }
    }
  #endif

  result.value = totalLightWeight > 0.0001
    ? clamp(weightedDiffuse / totalLightWeight, 0.0, 1.0)
    : 0.0;
  result.middleBand = terrainProjectToonBand(result.value, shadowStep);
  result.highlightBand = terrainProjectToonBand(result.value, highlightStep);
  result.directDiffuse = directDiffuse;
  result.environmentDiffuse = terrainProjectToonEnvironmentDiffuse(normal);
  return result;
}

vec3 terrainProjectApplyToonDiffusePalette(
  TerrainProjectToonDiffuseLighting lighting,
  vec3 shadowColor,
  vec3 baseColor,
  vec3 highlightColor
) {
  vec3 palette = mix(shadowColor, baseColor, lighting.middleBand);
  palette = mix(palette, highlightColor, lighting.highlightBand);
  return palette * max(lighting.directDiffuse + lighting.environmentDiffuse, vec3(0.0));
}

#ifdef MATERIAL_ROCK_TOP_GRASS_TOON_BANDS
float terrainProjectToonPaletteLuminance(vec3 color) {
  return dot(max(color, vec3(0.0)), vec3(0.2126, 0.7152, 0.0722));
}

vec3 terrainProjectApplyToonLightBandsToLitColor(
  TerrainProjectToonDiffuseLighting lighting,
  vec3 litColor,
  vec3 shadowReference,
  vec3 baseReference,
  vec3 highlightReference,
  float strength
) {
  float baseLuminance = max(terrainProjectToonPaletteLuminance(baseReference), 0.0001);
  float shadowScale = terrainProjectToonPaletteLuminance(shadowReference) / baseLuminance;
  float highlightScale = terrainProjectToonPaletteLuminance(highlightReference) / baseLuminance;
  float bandScale = mix(shadowScale, 1.0, lighting.middleBand);
  bandScale = mix(bandScale, highlightScale, lighting.highlightBand);
  return litColor * mix(1.0, max(bandScale, 0.0), clamp(strength, 0.0, 1.0));
}
#endif

#endif
