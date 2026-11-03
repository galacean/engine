#ifndef WATER_CONTACT_FOAM_INCLUDED
#define WATER_CONTACT_FOAM_INCLUDED

const float WATER_CONTACT_FOAM_HASH_MODULUS = {{HASH_MODULUS}};
const float WATER_CONTACT_FOAM_PHASE_PERIOD = {{PHASE_PERIOD}};
const float WATER_CONTACT_FOAM_FINITE_LIMIT = {{FINITE_LIMIT}};

bool waterContactFoamIsFinite(float value) {
  return value == value && abs(value) < WATER_CONTACT_FOAM_FINITE_LIMIT;
}

float waterContactFoamPositiveMod(float value, float modulus) {
  return mod(mod(value, modulus) + modulus, modulus);
}

float waterContactFoamPermute(float value) {
  return mod(
    (value * {{HASH_MULTIPLIER}} + {{HASH_OFFSET}}) * value,
    WATER_CONTACT_FOAM_HASH_MODULUS
  );
}

vec2 waterContactFoamHash22(vec2 cell) {
  vec2 wrapped = vec2(
    waterContactFoamPositiveMod(cell.x, WATER_CONTACT_FOAM_HASH_MODULUS),
    waterContactFoamPositiveMod(cell.y, WATER_CONTACT_FOAM_HASH_MODULUS)
  );
  float hashX = mod(waterContactFoamPermute(wrapped.x) + wrapped.y, WATER_CONTACT_FOAM_HASH_MODULUS);
  float hashY = mod(waterContactFoamPermute(wrapped.y) + wrapped.x, WATER_CONTACT_FOAM_HASH_MODULUS);
  return fract((vec2(hashX, hashY) + 1.0) * vec2(
    {{HASH_SCALE_X}},
    {{HASH_SCALE_Y}}
  ));
}

float waterContactFoamCandidateSquared(vec2 cell, vec2 localPosition, vec2 offset) {
  vec2 delta = offset + waterContactFoamHash22(cell + offset) - localPosition;
  return dot(delta, delta);
}

float waterContactFoamF1Squared(vec2 position) {
  vec2 cell = floor(position);
  vec2 localPosition = fract(position);
  float f1Squared = {{MAX_F1_SQUARED}};
  f1Squared = min(f1Squared, waterContactFoamCandidateSquared(cell, localPosition, vec2(-1.0, -1.0)));
  f1Squared = min(f1Squared, waterContactFoamCandidateSquared(cell, localPosition, vec2( 0.0, -1.0)));
  f1Squared = min(f1Squared, waterContactFoamCandidateSquared(cell, localPosition, vec2( 1.0, -1.0)));
  f1Squared = min(f1Squared, waterContactFoamCandidateSquared(cell, localPosition, vec2(-1.0,  0.0)));
  f1Squared = min(f1Squared, waterContactFoamCandidateSquared(cell, localPosition, vec2( 0.0,  0.0)));
  f1Squared = min(f1Squared, waterContactFoamCandidateSquared(cell, localPosition, vec2( 1.0,  0.0)));
  f1Squared = min(f1Squared, waterContactFoamCandidateSquared(cell, localPosition, vec2(-1.0,  1.0)));
  f1Squared = min(f1Squared, waterContactFoamCandidateSquared(cell, localPosition, vec2( 0.0,  1.0)));
  f1Squared = min(f1Squared, waterContactFoamCandidateSquared(cell, localPosition, vec2( 1.0,  1.0)));
  return clamp(f1Squared, 0.0, {{MAX_F1_SQUARED}});
}

float waterContactFoamVoronoiPattern(vec2 position) {
  if (!waterContactFoamIsFinite(position.x) || !waterContactFoamIsFinite(position.y)) return 0.0;
  return 1.0 - clamp(waterContactFoamF1Squared(position), 0.0, 1.0);
}

float evaluateWaterContactFoamVoronoi(
  vec2 worldPositionXz,
  float surfaceTime,
  float worldScale,
  float timeRate,
  vec3 octaveWeights,
  float lacunarity
) {
  #if {{OCTAVE_COUNT}} == 1
    if (
      !waterContactFoamIsFinite(worldPositionXz.x)
      || !waterContactFoamIsFinite(worldPositionXz.y)
      || !waterContactFoamIsFinite(surfaceTime)
      || !waterContactFoamIsFinite(worldScale)
      || !waterContactFoamIsFinite(timeRate)
      || !waterContactFoamIsFinite(lacunarity)
      || worldScale <= 0.0
      || timeRate <= 0.0
      || lacunarity <= 0.0
      || !(waterContactFoamIsFinite(octaveWeights.x) && octaveWeights.x >= 0.0)
    ) {
      return 0.0;
    }
  #elif {{OCTAVE_COUNT}} == 2
    if (
      !waterContactFoamIsFinite(worldPositionXz.x)
      || !waterContactFoamIsFinite(worldPositionXz.y)
      || !waterContactFoamIsFinite(surfaceTime)
      || !waterContactFoamIsFinite(worldScale)
      || !waterContactFoamIsFinite(timeRate)
      || !waterContactFoamIsFinite(lacunarity)
      || worldScale <= 0.0
      || timeRate <= 0.0
      || lacunarity <= 0.0
      || !(waterContactFoamIsFinite(octaveWeights.x) && octaveWeights.x >= 0.0
        && waterContactFoamIsFinite(octaveWeights.y) && octaveWeights.y >= 0.0)
    ) {
      return 0.0;
    }
  #else
    if (
      !waterContactFoamIsFinite(worldPositionXz.x)
      || !waterContactFoamIsFinite(worldPositionXz.y)
      || !waterContactFoamIsFinite(surfaceTime)
      || !waterContactFoamIsFinite(worldScale)
      || !waterContactFoamIsFinite(timeRate)
      || !waterContactFoamIsFinite(lacunarity)
      || worldScale <= 0.0
      || timeRate <= 0.0
      || lacunarity <= 0.0
      || !(waterContactFoamIsFinite(octaveWeights.x) && octaveWeights.x >= 0.0
        && waterContactFoamIsFinite(octaveWeights.y) && octaveWeights.y >= 0.0
        && waterContactFoamIsFinite(octaveWeights.z) && octaveWeights.z >= 0.0)
    ) {
      return 0.0;
    }
  #endif
  float scaledTime = surfaceTime * timeRate;
  if (!waterContactFoamIsFinite(scaledTime)) return 0.0;
  float phase = waterContactFoamPositiveMod(scaledTime, WATER_CONTACT_FOAM_PHASE_PERIOD);
  vec2 phaseOffset = vec2(phase, -phase);
  float safeWorldScale = worldScale;
  float safeLacunarity = lacunarity;
  #if {{OCTAVE_COUNT}} == 1
    float weightSum = octaveWeights.x;
  #elif {{OCTAVE_COUNT}} == 2
    float weightSum = octaveWeights.x + octaveWeights.y;
  #else
    float weightSum = octaveWeights.x + octaveWeights.y + octaveWeights.z;
  #endif
  if (!(weightSum > 0.0) || !waterContactFoamIsFinite(weightSum)) return 0.0;
  float weightedPattern = 0.0;
  weightedPattern += waterContactFoamVoronoiPattern(
    worldPositionXz * safeWorldScale * 1.0 + phaseOffset
  ) * octaveWeights.x;
  #if {{OCTAVE_COUNT}} >= 2
    weightedPattern += waterContactFoamVoronoiPattern(
      worldPositionXz * safeWorldScale * safeLacunarity + phaseOffset
    ) * octaveWeights.y;
  #endif
  #if {{OCTAVE_COUNT}} >= 3
    weightedPattern += waterContactFoamVoronoiPattern(
      worldPositionXz * safeWorldScale * (safeLacunarity * safeLacunarity) + phaseOffset
    ) * octaveWeights.z;
  #endif
  return clamp(weightedPattern / weightSum, 0.0, 1.0);
}

float evaluateWaterContactFoamDepthMask(
  float rawSceneDepthDelta,
  float centeredDepthBehind,
  float contactDistance
) {
  if (
    !waterContactFoamIsFinite(rawSceneDepthDelta)
    || !waterContactFoamIsFinite(centeredDepthBehind)
    || !waterContactFoamIsFinite(contactDistance)
    || centeredDepthBehind < 0.0
    || centeredDepthBehind > 1.0
    || contactDistance <= 0.0
    || rawSceneDepthDelta <= 0.0
    || rawSceneDepthDelta >= contactDistance
    || centeredDepthBehind == 0.0
  ) {
    return 0.0;
  }
  return centeredDepthBehind * (1.0 - clamp(rawSceneDepthDelta / contactDistance, 0.0, 1.0));
}

float evaluateWaterContactFoamMask(
  vec2 worldPositionXz,
  float surfaceTime,
  float rawSceneDepthDelta,
  float centeredDepthBehind,
  float worldScale,
  float timeRate,
  float opacity,
  float contactDistance,
  vec3 octaveWeights,
  float lacunarity
) {
  if (!waterContactFoamIsFinite(opacity) || opacity < 0.0 || opacity > 1.0) return 0.0;
  float depthMask = evaluateWaterContactFoamDepthMask(
    rawSceneDepthDelta,
    centeredDepthBehind,
    contactDistance
  );
  if (depthMask == 0.0 || opacity == 0.0) return 0.0;
  float voronoi = evaluateWaterContactFoamVoronoi(
    worldPositionXz,
    surfaceTime,
    worldScale,
    timeRate,
    octaveWeights,
    lacunarity
  );
  return clamp(depthMask * voronoi * opacity, 0.0, 1.0);
}

#endif
