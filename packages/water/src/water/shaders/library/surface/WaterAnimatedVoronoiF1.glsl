#ifndef WATER_ANIMATED_VORONOI_F1_INCLUDED
#define WATER_ANIMATED_VORONOI_F1_INCLUDED

bool waterAnimatedVoronoiF1IsFinite(float value) {
  return value == value && abs(value) < 1.0e20;
}

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
  // Compare squared distances before the single square root per octave.
  float f1 = 128.0;
  f1 = min(f1, waterAnimatedVoronoiF1Candidate(cell, localPosition, vec2(-1.0, -1.0), time));
  f1 = min(f1, waterAnimatedVoronoiF1Candidate(cell, localPosition, vec2(0.0, -1.0), time));
  f1 = min(f1, waterAnimatedVoronoiF1Candidate(cell, localPosition, vec2(1.0, -1.0), time));
  f1 = min(f1, waterAnimatedVoronoiF1Candidate(cell, localPosition, vec2(-1.0, 0.0), time));
  f1 = min(f1, waterAnimatedVoronoiF1Candidate(cell, localPosition, vec2(0.0, 0.0), time));
  f1 = min(f1, waterAnimatedVoronoiF1Candidate(cell, localPosition, vec2(1.0, 0.0), time));
  f1 = min(f1, waterAnimatedVoronoiF1Candidate(cell, localPosition, vec2(-1.0, 1.0), time));
  f1 = min(f1, waterAnimatedVoronoiF1Candidate(cell, localPosition, vec2(0.0, 1.0), time));
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
    if (
      !waterAnimatedVoronoiF1IsFinite(worldPositionXz.x)
      || !waterAnimatedVoronoiF1IsFinite(worldPositionXz.y)
      || !waterAnimatedVoronoiF1IsFinite(surfaceTime)
      || !waterAnimatedVoronoiF1IsFinite(worldScale)
      || !waterAnimatedVoronoiF1IsFinite(timeRate)
      || !waterAnimatedVoronoiF1IsFinite(lacunarity)
      || worldScale <= 0.0
      || timeRate <= 0.0
      || lacunarity <= 0.0
      || !(waterAnimatedVoronoiF1IsFinite(octaveWeights.x) && octaveWeights.x >= 0.0)
    ) {
      return 0.0;
    }
  #elif {{OCTAVE_COUNT}} == 2
    if (
      !waterAnimatedVoronoiF1IsFinite(worldPositionXz.x)
      || !waterAnimatedVoronoiF1IsFinite(worldPositionXz.y)
      || !waterAnimatedVoronoiF1IsFinite(surfaceTime)
      || !waterAnimatedVoronoiF1IsFinite(worldScale)
      || !waterAnimatedVoronoiF1IsFinite(timeRate)
      || !waterAnimatedVoronoiF1IsFinite(lacunarity)
      || worldScale <= 0.0
      || timeRate <= 0.0
      || lacunarity <= 0.0
      || !(waterAnimatedVoronoiF1IsFinite(octaveWeights.x) && octaveWeights.x >= 0.0
        && waterAnimatedVoronoiF1IsFinite(octaveWeights.y) && octaveWeights.y >= 0.0)
    ) {
      return 0.0;
    }
  #else
    if (
      !waterAnimatedVoronoiF1IsFinite(worldPositionXz.x)
      || !waterAnimatedVoronoiF1IsFinite(worldPositionXz.y)
      || !waterAnimatedVoronoiF1IsFinite(surfaceTime)
      || !waterAnimatedVoronoiF1IsFinite(worldScale)
      || !waterAnimatedVoronoiF1IsFinite(timeRate)
      || !waterAnimatedVoronoiF1IsFinite(lacunarity)
      || worldScale <= 0.0
      || timeRate <= 0.0
      || lacunarity <= 0.0
      || !(waterAnimatedVoronoiF1IsFinite(octaveWeights.x) && octaveWeights.x >= 0.0
        && waterAnimatedVoronoiF1IsFinite(octaveWeights.y) && octaveWeights.y >= 0.0
        && waterAnimatedVoronoiF1IsFinite(octaveWeights.z) && octaveWeights.z >= 0.0)
    ) {
      return 0.0;
    }
  #endif
  float animatedTime = surfaceTime * timeRate;
  if (!waterAnimatedVoronoiF1IsFinite(animatedTime)) return 0.0;
  float safeWorldScale = worldScale;
  float safeLacunarity = lacunarity;
  #if {{OCTAVE_COUNT}} == 1
    float weightSum = octaveWeights.x;
  #elif {{OCTAVE_COUNT}} == 2
    float weightSum = octaveWeights.x + octaveWeights.y;
  #else
    float weightSum = octaveWeights.x + octaveWeights.y + octaveWeights.z;
  #endif
  if (!(weightSum > 0.0) || !waterAnimatedVoronoiF1IsFinite(weightSum)) return 0.0;
  float weightedPattern = 0.0;
  weightedPattern += waterAnimatedVoronoiF1(
    worldPositionXz * safeWorldScale * 1.0,
    animatedTime
  ) * octaveWeights.x;
  #if {{OCTAVE_COUNT}} >= 2
    weightedPattern += waterAnimatedVoronoiF1(
      worldPositionXz * safeWorldScale * safeLacunarity,
      animatedTime
    ) * octaveWeights.y;
  #endif
  #if {{OCTAVE_COUNT}} >= 3
    weightedPattern += waterAnimatedVoronoiF1(
      worldPositionXz * safeWorldScale * safeLacunarity * safeLacunarity,
      animatedTime
    ) * octaveWeights.z;
  #endif
  return clamp(weightedPattern / weightSum, 0.0, 1.0);
}

#endif
