#ifndef TERRAIN_PROJECT_VEGETATION_SECOND_COLOR_INCLUDED
#define TERRAIN_PROJECT_VEGETATION_SECOND_COLOR_INCLUDED

#include "shared/VegetationNoise.glsl"

vec3 terrainProjectVegetationSecondColor(
  vec3 positionWS,
  vec3 positionOS,
  vec2 rawUv,
  vec3 baseAlbedo,
  vec3 secondAlbedo,
  float worldNoiseScale,
  float offset,
  float fade,
  float level,
  float gradient
) {
  #if defined(MATERIAL_SECOND_COLOR_WORLD_NOISE_3D)
    float overlay = terrainProjectVegetationSimplexNoise3D(positionWS * worldNoiseScale) * 0.5 + 0.5;
  #elif defined(MATERIAL_SECOND_COLOR_VERTEX_GRADIENT)
    float overlay = positionOS.y;
  #elif defined(MATERIAL_SECOND_COLOR_UV_GRADIENT)
    // Imported texture coordinates invert V, while this procedural mask follows the authored mesh gradient.
    float overlay = 1.0 - rawUv.y;
  #else
    float overlay = terrainProjectVegetationSimplexNoise2D(positionWS.xz * worldNoiseScale) * 0.5 + 0.5;
  #endif
  #ifdef MATERIAL_SECOND_COLOR_LINEAR_OBJECT_GRADIENT
    float secondColorMask = clamp((positionOS.y + level) * gradient, 0.0, 1.0);
  #else
    float shifted = overlay + (1.0 - offset);
    float secondColorMask = clamp(mix(shifted, 1.0 - shifted, fade + 0.5), 0.0, 1.0);
  #endif
  return mix(baseAlbedo, secondAlbedo, secondColorMask);
}

#endif
