#ifndef TERRAIN_PROJECT_LOD_DITHER_INCLUDED
#define TERRAIN_PROJECT_LOD_DITHER_INCLUDED

#include "shared/Instancing.glsl"

#ifdef RENDERER_LOD_DITHER
sampler2D material_LodDitherTexture;
float material_LodDitherTextureInvSize;

float terrainProjectCopySign(float value, float signValue) {
  return signValue >= 0.0 ? abs(value) : -abs(value);
}
#endif

void applyTerrainProjectInstanceLodDither(vec2 fragmentPosition, float instanceLodFade) {
  #ifdef RENDERER_LOD_DITHER
    float lodFade = clamp(instanceLodFade, -1.0, 1.0);
    if (lodFade >= 1.0) return;
    if (lodFade <= -1.0) discard;
    float threshold = texture2D(
      material_LodDitherTexture,
      fragmentPosition * material_LodDitherTextureInvSize
    ).a;
    if (lodFade - terrainProjectCopySign(threshold, lodFade) < 0.0) {
      discard;
    }
  #endif
}

void applyTerrainProjectLodDither(vec2 fragmentPosition) {
  #ifdef RENDERER_LOD_DITHER
    applyTerrainProjectInstanceLodDither(fragmentPosition, terrainProjectLodFade());
  #endif
}

#endif
