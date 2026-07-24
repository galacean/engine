import { describe, expect, it } from "vitest";
import {
  evaluateWaterSurfaceDirectBrdf,
  evaluateWaterSurfaceGgxDistribution,
  evaluateWaterSurfaceGgxSmithVisibility,
  evaluateWaterSurfaceSchlickFresnel,
  resolveWaterSurfaceBrdfRoughness
} from "../../runtime/wave/WaterSurfaceBrdf";

const RECIPROCAL_PI = 1 / Math.PI;

function pbrReference(input: {
  readonly fresnelF0: number;
  readonly roughness: number;
  readonly normalDotView: number;
  readonly normalDotLight: number;
  readonly normalDotHalf: number;
  readonly lightDotHalf: number;
}): number {
  const roughness = Math.max(0.045, Math.min(1, Math.max(0, input.roughness)));
  const alpha = roughness * roughness;
  const alphaSquared = alpha * alpha;
  const dotNV = Math.min(1, Math.max(0, input.normalDotView));
  const dotNL = Math.min(1, Math.max(0, input.normalDotLight));
  const dotNH = Math.min(1, Math.max(0, input.normalDotHalf));
  const dotLH = Math.min(1, Math.max(0, input.lightDotHalf));
  const fresnel =
    Math.min(1, Math.max(0, input.fresnelF0)) +
    (1 - Math.min(1, Math.max(0, input.fresnelF0))) * Math.pow(1 - dotLH, 5);
  const denominator = dotNH * dotNH * (alphaSquared - 1) + 1;
  const distribution = (RECIPROCAL_PI * alphaSquared) / Math.max(denominator * denominator, 1e-6);
  const gv = dotNL * Math.sqrt(alphaSquared + (1 - alphaSquared) * dotNV * dotNV);
  const gl = dotNV * Math.sqrt(alphaSquared + (1 - alphaSquared) * dotNL * dotNL);
  const visibility = 0.5 / Math.max(gv + gl, 1e-6);
  return fresnel * distribution * visibility * dotNL * Math.PI;
}

describe("WaterSurfaceBrdf", () => {
  it.each([
    [0.02, 0.08, 0.97, 0.91, 0.96, 0.98],
    [0.04, 0.32, 0.65, 0.72, 0.88, 0.81],
    [0.08, 0.78, 0.21, 0.4, 0.63, 0.55]
  ])(
    "matches Galacean PBR GGX/Schlick/Smith for reference vector %#",
    (fresnelF0, roughness, normalDotView, normalDotLight, normalDotHalf, lightDotHalf) => {
      const input = {
        fresnelF0,
        roughness,
        normalDotView,
        normalDotLight,
        normalDotHalf,
        lightDotHalf
      };

      expect(evaluateWaterSurfaceDirectBrdf(input).directSpecular).toBeCloseTo(
        pbrReference(input),
        10
      );
    }
  );

  it("uses the engine PBR minimum roughness and keeps every edge case finite", () => {
    expect(resolveWaterSurfaceBrdfRoughness(0)).toBe(0.045);
    expect(evaluateWaterSurfaceSchlickFresnel(0.02, 1, 0)).toBe(1);
    expect(evaluateWaterSurfaceGgxDistribution(0, 1)).toBeGreaterThan(0);
    expect(Number.isFinite(evaluateWaterSurfaceGgxSmithVisibility(0, 0, 0))).toBe(true);
    expect(
      Number.isFinite(
        evaluateWaterSurfaceDirectBrdf({
        fresnelF0: Number.NaN,
        roughness: Number.POSITIVE_INFINITY,
        normalDotView: Number.NaN,
        normalDotLight: Number.NEGATIVE_INFINITY,
        normalDotHalf: 2,
        lightDotHalf: -2
        }).directSpecular
      )
    ).toBe(true);
  });

  it("widens and attenuates the aligned highlight as roughness increases", () => {
    const shared = {
      fresnelF0: 0.02,
      normalDotView: 1,
      normalDotLight: 1,
      normalDotHalf: 1,
      lightDotHalf: 1
    };
    const smooth = evaluateWaterSurfaceDirectBrdf({ ...shared, roughness: 0.08 });
    const rough = evaluateWaterSurfaceDirectBrdf({ ...shared, roughness: 0.6 });

    expect(smooth.directSpecular).toBeGreaterThan(rough.directSpecular);
    expect(smooth.resolvedRoughness).toBeLessThan(rough.resolvedRoughness);
  });
});
