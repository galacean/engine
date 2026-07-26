/** Pure CPU references for the Surface Appearance depth, color, and refraction formulas. */

export interface WaterSurfaceAppearanceLinearRgba {
  red: number;
  green: number;
  blue: number;
  alpha: number;
}

export interface WaterSurfaceAppearanceUvDelta {
  x: number;
  y: number;
}

function saturateFinite(value: number): number {
  if (Number.isNaN(value) || value <= 0) return 0;
  if (value === Number.POSITIVE_INFINITY || value >= 1) return 1;
  return value;
}

function normalizedSceneDepthDelta(sceneDepthDelta: number, distance: number): number {
  if (!Number.isFinite(sceneDepthDelta) || sceneDepthDelta <= 0) return 0;
  if (!Number.isFinite(distance) || distance <= 0) return 0;
  return saturateFinite(sceneDepthDelta / distance);
}

function finiteSigned(value: number): number {
  return Number.isFinite(value) ? value : 0;
}

function finiteRefractionStrength(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 0;
}

/**
 * Evaluates `pow(saturate(rawSceneDepthDelta / distance), exponent)`.
 * Invalid samples and asset parameters fail closed.
 */
export function evaluateWaterSurfaceDepthTintFactor(
  sceneDepthDelta: number,
  distance: number,
  exponent: number
): number {
  const depthRatio = normalizedSceneDepthDelta(sceneDepthDelta, distance);
  if (depthRatio === 0) return 0;
  if (depthRatio === 1) return 1;
  if (!Number.isFinite(exponent) || exponent <= 0) return 0;
  return saturateFinite(Math.pow(depthRatio, exponent));
}

/** Writes a finite linear-space RGBA interpolation into the caller-owned output, preserving valid HDR values. */
export function mixWaterSurfaceAppearanceLinearRgba(
  source: Readonly<WaterSurfaceAppearanceLinearRgba>,
  tint: Readonly<WaterSurfaceAppearanceLinearRgba>,
  factor: number,
  out: WaterSurfaceAppearanceLinearRgba
): WaterSurfaceAppearanceLinearRgba {
  const weight = saturateFinite(factor);
  const inverseWeight = 1 - weight;
  out.red = finiteSigned(source.red) * inverseWeight + finiteSigned(tint.red) * weight;
  out.green = finiteSigned(source.green) * inverseWeight + finiteSigned(tint.green) * weight;
  out.blue = finiteSigned(source.blue) * inverseWeight + finiteSigned(tint.blue) * weight;
  out.alpha = finiteSigned(source.alpha) * inverseWeight + finiteSigned(tint.alpha) * weight;
  return out;
}

/** Evaluates `saturate(rawSceneDepthDelta / distance)` for Scene Depth coastal alpha. */
export function evaluateWaterSurfaceCoastalAlpha(sceneDepthDelta: number, distance: number): number {
  return normalizedSceneDepthDelta(sceneDepthDelta, distance);
}

/**
 * Applies the Appearance refraction strength directly to the signed view-normal delta.
 * No quality-specific legacy UV scale is introduced.
 */
export function evaluateWaterSurfaceAppearanceRefractionUvDelta(
  normalDelta: Readonly<WaterSurfaceAppearanceUvDelta>,
  strength: number,
  out: WaterSurfaceAppearanceUvDelta
): WaterSurfaceAppearanceUvDelta {
  const resolvedStrength = finiteRefractionStrength(strength);
  if (resolvedStrength === 0) {
    out.x = 0;
    out.y = 0;
    return out;
  }
  out.x = finiteSigned(normalDelta.x) * resolvedStrength;
  out.y = finiteSigned(normalDelta.y) * resolvedStrength;
  return out;
}
