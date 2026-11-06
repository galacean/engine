#ifndef TERRAIN_PROJECT_PROCEDURAL_LOD_DITHER_INCLUDED
#define TERRAIN_PROJECT_PROCEDURAL_LOD_DITHER_INCLUDED

#ifdef RENDERER_LOD_DITHER
  float renderer_LodFade;

  void applyTerrainProjectProceduralLodDither(vec2 fragmentPosition) {
    float threshold = fract(52.9829189 * fract(dot(fragmentPosition, vec2(0.06711056, 0.00583715))));
    float lodFade = clamp(renderer_LodFade, -1.0, 1.0);
    float signedThreshold = lodFade >= 0.0 ? threshold : -threshold;
    if (lodFade - signedThreshold < 0.0) discard;
  }
#else
  #define applyTerrainProjectProceduralLodDither(fragmentPosition)
#endif

#endif
