#ifndef WATER_ANIMATED_VORONOI_F1_INCLUDED
#define WATER_ANIMATED_VORONOI_F1_INCLUDED

float evaluateWaterAnimatedVoronoiF1(
  vec2 worldPositionXz,
  float surfaceTime,
  float worldScale,
  float timeRate,
  vec3 octaveWeights,
  float lacunarity
) {
  #if {{OCTAVE_COUNT}} == 1
    float weightSum = octaveWeights.x;
    bool validWeights = octaveWeights.x >= 0.0;
  #elif {{OCTAVE_COUNT}} == 2
    float weightSum = octaveWeights.x + octaveWeights.y;
    bool validWeights = octaveWeights.x >= 0.0 && octaveWeights.y >= 0.0;
  #else
    float weightSum = octaveWeights.x + octaveWeights.y + octaveWeights.z;
    bool validWeights = octaveWeights.x >= 0.0 && octaveWeights.y >= 0.0 && octaveWeights.z >= 0.0;
  #endif
  if (
    !(worldScale > 0.0)
    || !(timeRate > 0.0)
    || !(lacunarity > 0.0)
    || !validWeights
    || !(weightSum > 0.0)
  ) {
    return 0.0;
  }
  float animatedTime = surfaceTime * timeRate;
  // Shared 128x128 R8 periodic Voronoi tile spans 8 cells (1 / 8 = 0.125 UV per world cell).
  // Dual-speed UV velocities are exact multiples of 1 / 64 for seamless 64s clock wrapping.
  vec2 baseUv = (worldPositionXz * worldScale) * 0.125;
  float sampleA = texture2D(
    material_AppearanceV2VoronoiTexture,
    baseUv + animatedTime * vec2(0.03125, 0.015625)
  ).r;
  vec2 rotatedBaseUv = vec2(-baseUv.y, baseUv.x);
  #if {{OCTAVE_COUNT}} == 1
    float sampleB = texture2D(
      material_AppearanceV2VoronoiTexture,
      rotatedBaseUv + animatedTime * vec2(-0.015625, -0.03125)
    ).r;
    return clamp(0.5 * (sampleA + sampleB), 0.0, 1.0);
  #else
    #if {{OCTAVE_COUNT}} == 2
      float fineWeight = octaveWeights.y / weightSum;
    #else
      float fineWeight = (octaveWeights.y + octaveWeights.z) / weightSum;
    #endif
    float sampleB = texture2D(
      material_AppearanceV2VoronoiTexture,
      rotatedBaseUv * lacunarity + animatedTime * vec2(-0.015625, -0.03125)
    ).r;
    return clamp(mix(sampleA, sampleB, fineWeight), 0.0, 1.0);
  #endif
}

#endif
