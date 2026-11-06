/** Pure CPU reference for deterministic Scene Depth contact foam. */
import type { WaterSurfaceFoamOctaves } from "../../authoring/surface/WaterSurfaceAppearanceTypes";

export const WATER_CONTACT_FOAM_HASH_MODULUS = 289;
export const WATER_CONTACT_FOAM_HASH_MULTIPLIER = 34;
export const WATER_CONTACT_FOAM_HASH_OFFSET = 1;
export const WATER_CONTACT_FOAM_HASH_SCALE_X = 0.1031;
export const WATER_CONTACT_FOAM_HASH_SCALE_Y = 0.11369;
export const WATER_CONTACT_FOAM_PHASE_PERIOD = WATER_CONTACT_FOAM_HASH_MODULUS;
export const WATER_CONTACT_FOAM_MAX_F1_SQUARED = 2;
export const WATER_CONTACT_FOAM_FINITE_MAGNITUDE_LIMIT = 1e20;

export type WaterContactFoamOctaveCount = 1 | 2 | 3;
export type WaterContactFoamQuality = "low" | "medium" | "high";

export interface WaterContactFoamVector2 {
  x: number;
  y: number;
}

export interface WaterContactFoamParameters {
  readonly worldScale: number;
  readonly timeRate: number;
  readonly opacity: number;
  readonly contactDistance: number;
  readonly octaves: WaterSurfaceFoamOctaves;
  readonly lacunarity: number;
}

export interface WaterContactFoamInput {
  readonly worldX: number;
  readonly worldZ: number;
  readonly surfaceTime: number;
  readonly rawSceneDepthDelta: number;
  readonly centeredDepthBehind: number;
}

export interface WaterContactFoamEvaluation {
  phase: number;
  depthMask: number;
  voronoi: number;
  contactMask: number;
}

function isFiniteMagnitude(value: number): boolean {
  return Number.isFinite(value) && Math.abs(value) < WATER_CONTACT_FOAM_FINITE_MAGNITUDE_LIMIT;
}

function isFinitePositive(value: number): boolean {
  return isFiniteMagnitude(value) && value > 0;
}

function isFiniteUnit(value: number): boolean {
  return isFiniteMagnitude(value) && value >= 0 && value <= 1;
}

function positiveModulo(value: number, modulus: number): number {
  const remainder = value % modulus;
  return remainder < 0 ? remainder + modulus : remainder;
}

function fract(value: number): number {
  return value - Math.floor(value);
}

function saturate(value: number): number {
  if (value <= 0) return 0;
  if (value >= 1) return 1;
  return value;
}

function polynomialPermute(value: number): number {
  return positiveModulo(
    (value * WATER_CONTACT_FOAM_HASH_MULTIPLIER + WATER_CONTACT_FOAM_HASH_OFFSET) * value,
    WATER_CONTACT_FOAM_HASH_MODULUS
  );
}

function hashCellX(cellX: number, cellY: number): number {
  const wrappedX = positiveModulo(cellX, WATER_CONTACT_FOAM_HASH_MODULUS);
  const wrappedY = positiveModulo(cellY, WATER_CONTACT_FOAM_HASH_MODULUS);
  const hash = positiveModulo(polynomialPermute(wrappedX) + wrappedY, WATER_CONTACT_FOAM_HASH_MODULUS);
  return fract((hash + 1) * WATER_CONTACT_FOAM_HASH_SCALE_X);
}

function hashCellY(cellX: number, cellY: number): number {
  const wrappedX = positiveModulo(cellX, WATER_CONTACT_FOAM_HASH_MODULUS);
  const wrappedY = positiveModulo(cellY, WATER_CONTACT_FOAM_HASH_MODULUS);
  const hash = positiveModulo(polynomialPermute(wrappedY) + wrappedX, WATER_CONTACT_FOAM_HASH_MODULUS);
  return fract((hash + 1) * WATER_CONTACT_FOAM_HASH_SCALE_Y);
}

function hasValidOctaves(octaves: WaterSurfaceFoamOctaves): boolean {
  if (octaves.weights.length !== octaves.count) return false;
  let weightSum = 0;
  for (let index = 0; index < octaves.count; index++) {
    const weight = octaves.weights[index];
    if (!isFiniteMagnitude(weight) || weight < 0) return false;
    weightSum += weight;
  }
  return isFinitePositive(weightSum);
}

/** Hashes an integer cell into two deterministic feature-point coordinates in `[0, 1)`. */
export function hashWaterContactFoamCell(
  cellX: number,
  cellY: number,
  out: WaterContactFoamVector2
): WaterContactFoamVector2 {
  if (!isFiniteMagnitude(cellX) || !isFiniteMagnitude(cellY)) {
    out.x = 0;
    out.y = 0;
    return out;
  }
  const integerCellX = Math.floor(cellX);
  const integerCellY = Math.floor(cellY);
  out.x = hashCellX(integerCellX, integerCellY);
  out.y = hashCellY(integerCellX, integerCellY);
  return out;
}

/**
 * Evaluates squared 3x3 F1 Voronoi distance. Squared distance avoids a square root
 * and remains bounded in `[0, 2]`; invalid domains return the non-foaming maximum.
 */
export function evaluateWaterContactFoamF1Squared(positionX: number, positionY: number): number {
  if (!isFiniteMagnitude(positionX) || !isFiniteMagnitude(positionY)) {
    return WATER_CONTACT_FOAM_MAX_F1_SQUARED;
  }
  const cellX = Math.floor(positionX);
  const cellY = Math.floor(positionY);
  const localX = fract(positionX);
  const localY = fract(positionY);
  let f1Squared = WATER_CONTACT_FOAM_MAX_F1_SQUARED;
  for (let offsetY = -1; offsetY <= 1; offsetY++) {
    for (let offsetX = -1; offsetX <= 1; offsetX++) {
      const neighborX = cellX + offsetX;
      const neighborY = cellY + offsetY;
      const deltaX = offsetX + hashCellX(neighborX, neighborY) - localX;
      const deltaY = offsetY + hashCellY(neighborX, neighborY) - localY;
      f1Squared = Math.min(f1Squared, deltaX * deltaX + deltaY * deltaY);
    }
  }
  return Math.min(Math.max(f1Squared, 0), WATER_CONTACT_FOAM_MAX_F1_SQUARED);
}

/**
 * Produces the bounded phase used by every octave. Translating by the polynomial
 * hash period makes the wrap continuous without trigonometry.
 */
export function resolveWaterContactFoamPhase(surfaceTime: number, timeRate: number): number {
  if (!isFiniteMagnitude(surfaceTime) || !isFinitePositive(timeRate)) return 0;
  const scaledTime = surfaceTime * timeRate;
  if (!isFiniteMagnitude(scaledTime)) return 0;
  return positiveModulo(scaledTime, WATER_CONTACT_FOAM_PHASE_PERIOD);
}

/** Returns the static quality policy: Low off, Medium two octaves, High three. */
export function resolveWaterContactFoamOctaveCountForQuality(quality: WaterContactFoamQuality): 0 | 2 | 3 {
  switch (quality) {
    case "low":
      return 0;
    case "medium":
      return 2;
    case "high":
      return 3;
  }
}

/**
 * Evaluates normalized one-, two-, or three-octave Voronoi foam.
 * All active weights are non-negative and normalized before returning.
 */
export function evaluateWaterContactFoamVoronoi(
  worldX: number,
  worldZ: number,
  surfaceTime: number,
  parameters: Readonly<WaterContactFoamParameters>
): number {
  if (
    !isFiniteMagnitude(worldX) ||
    !isFiniteMagnitude(worldZ) ||
    !isFiniteMagnitude(surfaceTime) ||
    !isFinitePositive(parameters.worldScale) ||
    !isFinitePositive(parameters.timeRate) ||
    !isFinitePositive(parameters.lacunarity) ||
    !hasValidOctaves(parameters.octaves)
  ) {
    return 0;
  }
  const phase = resolveWaterContactFoamPhase(surfaceTime, parameters.timeRate);
  let frequency = 1;
  let weightedPattern = 0;
  let weightSum = 0;
  for (let octave = 0; octave < parameters.octaves.count; octave++) {
    const domainX = worldX * parameters.worldScale * frequency + phase;
    const domainY = worldZ * parameters.worldScale * frequency - phase;
    if (!isFiniteMagnitude(domainX) || !isFiniteMagnitude(domainY)) return 0;
    const pattern = 1 - saturate(evaluateWaterContactFoamF1Squared(domainX, domainY));
    const weight = parameters.octaves.weights[octave];
    weightedPattern += pattern * weight;
    weightSum += weight;
    frequency *= parameters.lacunarity;
    if (!isFiniteMagnitude(frequency)) return 0;
  }
  return saturate(weightedPattern / weightSum);
}

/** Scene-depth-only contact band; invalid, non-behind, and far samples are exactly zero. */
export function evaluateWaterContactFoamDepthMask(
  rawSceneDepthDelta: number,
  centeredDepthBehind: number,
  contactDistance: number
): number {
  if (
    !isFiniteMagnitude(rawSceneDepthDelta) ||
    !isFiniteUnit(centeredDepthBehind) ||
    !isFinitePositive(contactDistance) ||
    rawSceneDepthDelta <= 0 ||
    rawSceneDepthDelta >= contactDistance ||
    centeredDepthBehind === 0
  ) {
    return 0;
  }
  return centeredDepthBehind * (1 - saturate(rawSceneDepthDelta / contactDistance));
}

/** Writes the full finite contact-foam reference result into caller-owned storage. */
export function evaluateWaterContactFoam(
  input: Readonly<WaterContactFoamInput>,
  parameters: Readonly<WaterContactFoamParameters>,
  out: WaterContactFoamEvaluation
): WaterContactFoamEvaluation {
  out.phase = 0;
  out.depthMask = 0;
  out.voronoi = 0;
  out.contactMask = 0;
  if (
    !isFiniteUnit(parameters.opacity) ||
    !isFinitePositive(parameters.contactDistance) ||
    !hasValidOctaves(parameters.octaves)
  ) {
    return out;
  }
  out.phase = resolveWaterContactFoamPhase(input.surfaceTime, parameters.timeRate);
  out.depthMask = evaluateWaterContactFoamDepthMask(
    input.rawSceneDepthDelta,
    input.centeredDepthBehind,
    parameters.contactDistance
  );
  if (out.depthMask === 0 || parameters.opacity === 0) return out;
  out.voronoi = evaluateWaterContactFoamVoronoi(input.worldX, input.worldZ, input.surfaceTime, parameters);
  out.contactMask = saturate(out.depthMask * out.voronoi * parameters.opacity);
  return out;
}
