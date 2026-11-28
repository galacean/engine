#ifndef WATER_ANIMATED_VORONOI_F1_INCLUDED
#define WATER_ANIMATED_VORONOI_F1_INCLUDED

vec2 waterAnimatedVoronoiF1Hash(vec2 cell) {
  vec2 projected = vec2(
    dot(cell, vec2(127.1, 311.7)),
    dot(cell, vec2(269.5, 183.3))
  );
  return fract(sin(projected) * 43758.5453);
}

float waterAnimatedVoronoiF1Candidate(
  vec2 cell,
  vec2 localPosition,
  vec2 cellOffset,
  float time
) {
  vec2 randomOffset = waterAnimatedVoronoiF1Hash(cell + cellOffset);
  vec2 animatedOffset = sin(time + randomOffset * 6.2831) * 0.5 + 0.5;
  vec2 delta = localPosition - cellOffset - animatedOffset;
  return dot(delta, delta);
}

float waterAnimatedVoronoiF1(vec2 position, float time) {
  vec2 cell = floor(position);
  vec2 localPosition = fract(position);
  // Center cell first, then 4 orthogonal and 4 diagonal neighbors (commutative min).
  float f1 = waterAnimatedVoronoiF1Candidate(cell, localPosition, vec2(0.0, 0.0), time);
  f1 = min(f1, waterAnimatedVoronoiF1Candidate(cell, localPosition, vec2(-1.0, 0.0), time));
  f1 = min(f1, waterAnimatedVoronoiF1Candidate(cell, localPosition, vec2(1.0, 0.0), time));
  f1 = min(f1, waterAnimatedVoronoiF1Candidate(cell, localPosition, vec2(0.0, -1.0), time));
  f1 = min(f1, waterAnimatedVoronoiF1Candidate(cell, localPosition, vec2(0.0, 1.0), time));
  f1 = min(f1, waterAnimatedVoronoiF1Candidate(cell, localPosition, vec2(-1.0, -1.0), time));
  f1 = min(f1, waterAnimatedVoronoiF1Candidate(cell, localPosition, vec2(1.0, -1.0), time));
  f1 = min(f1, waterAnimatedVoronoiF1Candidate(cell, localPosition, vec2(-1.0, 1.0), time));
  f1 = min(f1, waterAnimatedVoronoiF1Candidate(cell, localPosition, vec2(1.0, 1.0), time));
  return clamp(0.707 * sqrt(f1), 0.0, 1.0);
}

float waterAnimatedVoronoiF1UpperBounded(vec2 position, float time, float f1Max) {
  vec2 cell = floor(position);
  vec2 localPosition = fract(position);
  // Center-first exact early exit: since f1 can only decrease across min(), f1 <= f1Max
  // already proves final F1 <= f1Max. Negative f1Max disables early exit.
  float f1 = waterAnimatedVoronoiF1Candidate(cell, localPosition, vec2(0.0, 0.0), time);
  if (f1 <= f1Max) return 0.0;
  f1 = min(f1, waterAnimatedVoronoiF1Candidate(cell, localPosition, vec2(-1.0, 0.0), time));
  f1 = min(f1, waterAnimatedVoronoiF1Candidate(cell, localPosition, vec2(1.0, 0.0), time));
  f1 = min(f1, waterAnimatedVoronoiF1Candidate(cell, localPosition, vec2(0.0, -1.0), time));
  f1 = min(f1, waterAnimatedVoronoiF1Candidate(cell, localPosition, vec2(0.0, 1.0), time));
  if (f1 <= f1Max) return 0.0;
  f1 = min(f1, waterAnimatedVoronoiF1Candidate(cell, localPosition, vec2(-1.0, -1.0), time));
  f1 = min(f1, waterAnimatedVoronoiF1Candidate(cell, localPosition, vec2(1.0, -1.0), time));
  f1 = min(f1, waterAnimatedVoronoiF1Candidate(cell, localPosition, vec2(-1.0, 1.0), time));
  f1 = min(f1, waterAnimatedVoronoiF1Candidate(cell, localPosition, vec2(1.0, 1.0), time));
  return clamp(0.707 * sqrt(f1), 0.0, 1.0);
}

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
  float weightedPattern = 0.0;
  if (octaveWeights.x > 0.0) {
    weightedPattern += waterAnimatedVoronoiF1(
      worldPositionXz * worldScale,
      animatedTime
    ) * octaveWeights.x;
  }
  #if {{OCTAVE_COUNT}} >= 2
    if (octaveWeights.y > 0.0) {
      weightedPattern += waterAnimatedVoronoiF1(
        worldPositionXz * worldScale * lacunarity,
        animatedTime
      ) * octaveWeights.y;
    }
  #endif
  #if {{OCTAVE_COUNT}} >= 3
    if (octaveWeights.z > 0.0) {
      weightedPattern += waterAnimatedVoronoiF1(
        worldPositionXz * worldScale * lacunarity * lacunarity,
        animatedTime
      ) * octaveWeights.z;
    }
  #endif
  return clamp(weightedPattern / weightSum, 0.0, 1.0);
}

float evaluateWaterAnimatedVoronoiF1UpperBounded(
  vec2 worldPositionXz,
  float surfaceTime,
  float worldScale,
  float timeRate,
  vec3 octaveWeights,
  float lacunarity,
  float pMax
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
  if (pMax >= 1.0) return 0.0;
  const float eps = 0.00001;
  float animatedTime = surfaceTime * timeRate;
  float targetSum = pMax * weightSum;
  float w0 = octaveWeights.x;
  #if {{OCTAVE_COUNT}} == 1
    float rest0 = 0.0;
  #elif {{OCTAVE_COUNT}} == 2
    float rest0 = octaveWeights.y;
  #else
    float rest0 = octaveWeights.y + octaveWeights.z;
  #endif
  float v0Max = (w0 > 0.0) ? ((targetSum - rest0) / w0 - eps) : -1.0;
  if (v0Max >= 1.0) return 0.0;
  float f1Max0 = (v0Max > 0.0) ? ((v0Max / 0.707) * (v0Max / 0.707)) : -1.0;
  float v0 = (w0 > 0.0)
    ? waterAnimatedVoronoiF1UpperBounded(worldPositionXz * worldScale, animatedTime, f1Max0)
    : 0.0;
  if (v0Max >= 0.0 && v0 <= v0Max) return 0.0;
  float weightedPattern = w0 * v0;
  #if {{OCTAVE_COUNT}} >= 2
    float w1 = octaveWeights.y;
    #if {{OCTAVE_COUNT}} == 3
      float rest1 = octaveWeights.z;
    #else
      float rest1 = 0.0;
    #endif
    float v1Max = (w1 > 0.0) ? ((targetSum - weightedPattern - rest1) / w1 - eps) : -1.0;
    if (v1Max >= 1.0) return 0.0;
    float f1Max1 = (v1Max > 0.0) ? ((v1Max / 0.707) * (v1Max / 0.707)) : -1.0;
    float v1 = (w1 > 0.0)
      ? waterAnimatedVoronoiF1UpperBounded(worldPositionXz * worldScale * lacunarity, animatedTime, f1Max1)
      : 0.0;
    if (v1Max >= 0.0 && v1 <= v1Max) return 0.0;
    weightedPattern += w1 * v1;
  #endif
  #if {{OCTAVE_COUNT}} >= 3
    float w2 = octaveWeights.z;
    float v2Max = (w2 > 0.0) ? ((targetSum - weightedPattern) / w2 - eps) : -1.0;
    if (v2Max >= 1.0) return 0.0;
    float f1Max2 = (v2Max > 0.0) ? ((v2Max / 0.707) * (v2Max / 0.707)) : -1.0;
    float v2 = (w2 > 0.0)
      ? waterAnimatedVoronoiF1UpperBounded(
          worldPositionXz * worldScale * lacunarity * lacunarity,
          animatedTime,
          f1Max2
        )
      : 0.0;
    if (v2Max >= 0.0 && v2 <= v2Max) return 0.0;
    weightedPattern += w2 * v2;
  #endif
  return clamp(weightedPattern / weightSum, 0.0, 1.0);
}

#endif
