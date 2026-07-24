/** CPU reference for the water shader's Galacean-PBR-aligned isotropic GGX direct specular. */

const RECIPROCAL_PI = 1 / Math.PI;
const MIN_PERCEPTUAL_ROUGHNESS = 0.045;
const BRDF_EPSILON = 1e-6;

export interface WaterSurfaceBrdfInput {
  readonly fresnelF0: number;
  readonly roughness: number;
  readonly normalDotView: number;
  readonly normalDotLight: number;
  readonly normalDotHalf: number;
  readonly lightDotHalf: number;
}

export interface WaterSurfaceBrdfOutput {
  readonly resolvedRoughness: number;
  readonly fresnel: number;
  readonly distribution: number;
  readonly visibility: number;
  readonly directSpecular: number;
}

function saturate(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

/** Matches Galacean PBR's minimum perceptual roughness. */
export function resolveWaterSurfaceBrdfRoughness(roughness: number): number {
  return Math.max(MIN_PERCEPTUAL_ROUGHNESS, saturate(roughness));
}

/** Scalar Schlick term used by Galacean's PBR BSDF. */
export function evaluateWaterSurfaceSchlickFresnel(
  fresnelF0: number,
  fresnelF90: number,
  lightDotHalf: number
): number {
  const f0 = saturate(fresnelF0);
  const f90 = saturate(fresnelF90);
  return f0 + (f90 - f0) * Math.pow(1 - saturate(lightDotHalf), 5);
}

/** GGX normal distribution using Disney's alpha = perceptualRoughness squared mapping. */
export function evaluateWaterSurfaceGgxDistribution(alpha: number, normalDotHalf: number): number {
  const resolvedAlpha = Math.max(MIN_PERCEPTUAL_ROUGHNESS * MIN_PERCEPTUAL_ROUGHNESS, alpha);
  const alphaSquared = resolvedAlpha * resolvedAlpha;
  const dotNH = saturate(normalDotHalf);
  const denominator = dotNH * dotNH * (alphaSquared - 1) + 1;
  return (RECIPROCAL_PI * alphaSquared) / Math.max(denominator * denominator, BRDF_EPSILON);
}

/** Height-correlated Smith visibility copied from Galacean's PBR BSDF contract. */
export function evaluateWaterSurfaceGgxSmithVisibility(
  alpha: number,
  normalDotLight: number,
  normalDotView: number
): number {
  const resolvedAlpha = Math.max(MIN_PERCEPTUAL_ROUGHNESS * MIN_PERCEPTUAL_ROUGHNESS, alpha);
  const alphaSquared = resolvedAlpha * resolvedAlpha;
  const dotNL = saturate(normalDotLight);
  const dotNV = saturate(normalDotView);
  const gv = dotNL * Math.sqrt(alphaSquared + (1 - alphaSquared) * dotNV * dotNV);
  const gl = dotNV * Math.sqrt(alphaSquared + (1 - alphaSquared) * dotNL * dotNL);
  return 0.5 / Math.max(gv + gl, BRDF_EPSILON);
}

/**
 * Returns the scalar direct-light specular multiplier before sunlight colour.
 * Galacean's PBR path multiplies GGX by irradiance `NdotL * lightColor * PI`.
 */
export function evaluateWaterSurfaceDirectBrdf(
  input: Readonly<WaterSurfaceBrdfInput>
): Readonly<WaterSurfaceBrdfOutput> {
  const resolvedRoughness = resolveWaterSurfaceBrdfRoughness(input.roughness);
  const alpha = resolvedRoughness * resolvedRoughness;
  const fresnel = evaluateWaterSurfaceSchlickFresnel(input.fresnelF0, 1, input.lightDotHalf);
  const distribution = evaluateWaterSurfaceGgxDistribution(alpha, input.normalDotHalf);
  const visibility = evaluateWaterSurfaceGgxSmithVisibility(
    alpha,
    input.normalDotLight,
    input.normalDotView
  );
  const directSpecular =
    fresnel * distribution * visibility * saturate(input.normalDotLight) * Math.PI;
  return Object.freeze({
    resolvedRoughness,
    fresnel,
    distribution,
    visibility,
    directSpecular: Number.isFinite(directSpecular) ? directSpecular : 0
  });
}
