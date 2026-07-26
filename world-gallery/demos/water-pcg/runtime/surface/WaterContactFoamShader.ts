/** Deterministic, allocation-free GLSL helpers for Scene Depth contact foam. */
import {
  WATER_CONTACT_FOAM_FINITE_MAGNITUDE_LIMIT,
  WATER_CONTACT_FOAM_HASH_MODULUS,
  WATER_CONTACT_FOAM_HASH_MULTIPLIER,
  WATER_CONTACT_FOAM_HASH_OFFSET,
  WATER_CONTACT_FOAM_HASH_SCALE_X,
  WATER_CONTACT_FOAM_HASH_SCALE_Y,
  WATER_CONTACT_FOAM_MAX_F1_SQUARED,
  WATER_CONTACT_FOAM_PHASE_PERIOD,
  resolveWaterContactFoamOctaveCountForQuality,
  type WaterContactFoamOctaveCount,
  type WaterContactFoamQuality
} from "./WaterContactFoam";

function glsl(value: number): string {
  return Number.isInteger(value) ? `${value}.0` : String(value);
}

function createOctaveStatements(octaveCount: WaterContactFoamOctaveCount): string {
  const weightComponents = ["x", "y", "z"] as const;
  const statements: string[] = [];
  for (let octave = 0; octave < octaveCount; octave++) {
    const frequency = octave === 0 ? "1.0" : octave === 1 ? "safeLacunarity" : "(safeLacunarity * safeLacunarity)";
    statements.push(`  weightedPattern += waterContactFoamVoronoiPattern(
    worldPositionXz * safeWorldScale * ${frequency} + phaseOffset
  ) * octaveWeights.${weightComponents[octave]};`);
  }
  return statements.join("\n");
}

function createWeightValidation(octaveCount: WaterContactFoamOctaveCount): string {
  const weightComponents = ["x", "y", "z"] as const;
  return Array.from(
    { length: octaveCount },
    (_, index) =>
      `waterContactFoamIsFinite(octaveWeights.${weightComponents[index]}) && octaveWeights.${weightComponents[index]} >= 0.0`
  ).join("\n    && ");
}

function createWeightSum(octaveCount: WaterContactFoamOctaveCount): string {
  return ["octaveWeights.x", "octaveWeights.y", "octaveWeights.z"].slice(0, octaveCount).join(" + ");
}

/**
 * Generates a fixed one-, two-, or three-octave module. The 3x3 F1 search and
 * active octave calls are unrolled so callers choose only Medium or High cost.
 */
export function createWaterContactFoamShaderFunctions(octaveCount: WaterContactFoamOctaveCount): string {
  return `
const float WATER_CONTACT_FOAM_HASH_MODULUS = ${glsl(WATER_CONTACT_FOAM_HASH_MODULUS)};
const float WATER_CONTACT_FOAM_PHASE_PERIOD = ${glsl(WATER_CONTACT_FOAM_PHASE_PERIOD)};
const float WATER_CONTACT_FOAM_FINITE_LIMIT = ${WATER_CONTACT_FOAM_FINITE_MAGNITUDE_LIMIT.toExponential()};

bool waterContactFoamIsFinite(float value) {
  return value == value && abs(value) < WATER_CONTACT_FOAM_FINITE_LIMIT;
}

float waterContactFoamPositiveMod(float value, float modulus) {
  return mod(mod(value, modulus) + modulus, modulus);
}

float waterContactFoamPermute(float value) {
  return mod(
    (value * ${glsl(WATER_CONTACT_FOAM_HASH_MULTIPLIER)} + ${glsl(WATER_CONTACT_FOAM_HASH_OFFSET)}) * value,
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
    ${glsl(WATER_CONTACT_FOAM_HASH_SCALE_X)},
    ${glsl(WATER_CONTACT_FOAM_HASH_SCALE_Y)}
  ));
}

float waterContactFoamCandidateSquared(vec2 cell, vec2 localPosition, vec2 offset) {
  vec2 delta = offset + waterContactFoamHash22(cell + offset) - localPosition;
  return dot(delta, delta);
}

float waterContactFoamF1Squared(vec2 position) {
  vec2 cell = floor(position);
  vec2 localPosition = fract(position);
  float f1Squared = ${glsl(WATER_CONTACT_FOAM_MAX_F1_SQUARED)};
  f1Squared = min(f1Squared, waterContactFoamCandidateSquared(cell, localPosition, vec2(-1.0, -1.0)));
  f1Squared = min(f1Squared, waterContactFoamCandidateSquared(cell, localPosition, vec2( 0.0, -1.0)));
  f1Squared = min(f1Squared, waterContactFoamCandidateSquared(cell, localPosition, vec2( 1.0, -1.0)));
  f1Squared = min(f1Squared, waterContactFoamCandidateSquared(cell, localPosition, vec2(-1.0,  0.0)));
  f1Squared = min(f1Squared, waterContactFoamCandidateSquared(cell, localPosition, vec2( 0.0,  0.0)));
  f1Squared = min(f1Squared, waterContactFoamCandidateSquared(cell, localPosition, vec2( 1.0,  0.0)));
  f1Squared = min(f1Squared, waterContactFoamCandidateSquared(cell, localPosition, vec2(-1.0,  1.0)));
  f1Squared = min(f1Squared, waterContactFoamCandidateSquared(cell, localPosition, vec2( 0.0,  1.0)));
  f1Squared = min(f1Squared, waterContactFoamCandidateSquared(cell, localPosition, vec2( 1.0,  1.0)));
  return clamp(f1Squared, 0.0, ${glsl(WATER_CONTACT_FOAM_MAX_F1_SQUARED)});
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
    || !(${createWeightValidation(octaveCount)})
  ) {
    return 0.0;
  }
  float scaledTime = surfaceTime * timeRate;
  if (!waterContactFoamIsFinite(scaledTime)) return 0.0;
  float phase = waterContactFoamPositiveMod(scaledTime, WATER_CONTACT_FOAM_PHASE_PERIOD);
  vec2 phaseOffset = vec2(phase, -phase);
  float safeWorldScale = worldScale;
  float safeLacunarity = lacunarity;
  float weightSum = ${createWeightSum(octaveCount)};
  if (!(weightSum > 0.0) || !waterContactFoamIsFinite(weightSum)) return 0.0;
  float weightedPattern = 0.0;
${createOctaveStatements(octaveCount)}
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
`;
}

/** Low returns no module; Medium and High select fixed two-/three-octave code. */
export function createWaterContactFoamShaderFunctionsForQuality(quality: WaterContactFoamQuality): string | undefined {
  const octaveCount = resolveWaterContactFoamOctaveCountForQuality(quality);
  return octaveCount === 0 ? undefined : createWaterContactFoamShaderFunctions(octaveCount);
}
