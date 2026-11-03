#ifndef TERRAIN_PROJECT_GROUND_WIND_LIGHTING_INCLUDED
#define TERRAIN_PROJECT_GROUND_WIND_LIGHTING_INCLUDED

float terrainProjectGroundWindLightingSweep(vec3 normalWS) {
  vec3 normalizedNormal = normalize(normalWS);
  float weightedDiffuse = 0.0;
  float totalLightWeight = 0.0;
  #ifdef SCENE_DIRECT_LIGHT_COUNT
    for (int lightIndex = 0; lightIndex < SCENE_DIRECT_LIGHT_COUNT; lightIndex++) {
      if (!isRendererCulledByLight(renderer_Layer.xy, scene_DirectLightCullingMask[lightIndex])) {
        float lightWeight = dot(
          max(scene_DirectLightColor[lightIndex], vec3(0.0)),
          vec3(0.2126, 0.7152, 0.0722)
        );
        vec3 directionToLight = -normalize(scene_DirectLightDirection[lightIndex]);
        weightedDiffuse += max(dot(normalizedNormal, directionToLight), 0.0) * lightWeight;
        totalLightWeight += lightWeight;
      }
    }
  #endif
  return totalLightWeight > 0.0001
    ? clamp(weightedDiffuse / totalLightWeight, 0.0, 1.0)
    : clamp(normalizedNormal.y, 0.0, 1.0);
}

#endif
