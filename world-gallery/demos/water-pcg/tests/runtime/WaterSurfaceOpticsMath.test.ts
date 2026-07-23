import { describe, expect, it } from "vitest";
import {
  DEFAULT_WATER_OPTICAL_PROFILE,
  evaluateWaterOpticalMedium,
  type WaterOpticalColor,
  type WaterOpticalProfile
} from "../../runtime/optics/WaterOpticalProfile";
import {
  calculateWaterFresnelF0,
  createWaterSurfaceOpticsResult,
  evaluateWaterSurfaceOptics
} from "../../runtime/optics/WaterSurfaceOpticsMath";

function color(red = 1, green = 1, blue = 1): WaterOpticalColor {
  return { red, green, blue };
}

function evaluate(distance: number, profile = DEFAULT_WATER_OPTICAL_PROFILE) {
  return evaluateWaterSurfaceOptics(
    profile,
    distance,
    0.65,
    color(0.8, 0.6, 0.4),
    color(0.2, 0.3, 0.5),
    createWaterSurfaceOpticsResult()
  );
}

describe("WaterSurfaceOpticsMath", () => {
  it("derives the expected normal-incidence reflectance for water IOR 1.333", () => {
    expect(calculateWaterFresnelF0(1.333)).toBeCloseTo(0.020373187841971414, 10);
  });

  it("keeps transmittance monotonic and equal to one at zero distance", () => {
    const atZero = evaluate(0);
    const atOne = evaluate(1);
    const atFour = evaluate(4);

    expect(atZero.transmittance).toEqual(color());
    for (const channel of ["red", "green", "blue"] as const) {
      expect(atOne.transmittance[channel]).toBeLessThanOrEqual(atZero.transmittance[channel]);
      expect(atFour.transmittance[channel]).toBeLessThanOrEqual(atOne.transmittance[channel]);
    }
  });

  it("matches the documented transmitted plus reflected surface formula", () => {
    const profile: WaterOpticalProfile = {
      absorptionCoefficient: [0.2, 0.1, 0.05],
      scatteringColor: [0.04, 0.08, 0.12],
      scatteringCoefficient: 0.25,
      maximumViewDistance: 20,
      maximumSurfaceOpticalDistance: 5,
      indexOfRefraction: 1.333,
      reflectionIntensity: 0.75
    };
    const source = color(0.7, 0.5, 0.3);
    const reflection = color(0.1, 0.4, 0.9);
    const result = createWaterSurfaceOpticsResult();
    evaluateWaterSurfaceOptics(profile, 2, 0.7, source, reflection, result);

    const scatteringWeight = 1 - Math.exp(-profile.scatteringCoefficient * 2);
    const expectedTransmittedRed =
      source.red * Math.exp(-profile.absorptionCoefficient[0] * 2) + profile.scatteringColor[0] * scatteringWeight;
    const expectedFinalRed =
      expectedTransmittedRed * (1 - result.fresnel) +
      reflection.red * result.fresnel * (profile.reflectionIntensity ?? 1);
    expect(result.transmittedColor.red).toBeCloseTo(expectedTransmittedRed, 12);
    expect(result.finalColor.red).toBeCloseTo(expectedFinalRed, 12);
  });

  it("uses the same profile and medium terms for surface and underwater evaluation", () => {
    const source = color(0.75, 0.5, 0.25);
    const underwater = color();
    const surface = createWaterSurfaceOpticsResult();
    evaluateWaterOpticalMedium(DEFAULT_WATER_OPTICAL_PROFILE, 3, source, underwater);
    evaluateWaterSurfaceOptics(DEFAULT_WATER_OPTICAL_PROFILE, 3, 1, source, color(0, 0, 0), surface);

    expect(surface.transmittedColor.red).toBeCloseTo(underwater.red, 12);
    expect(surface.transmittedColor.green).toBeCloseTo(underwater.green, 12);
    expect(surface.transmittedColor.blue).toBeCloseTo(underwater.blue, 12);
  });

  it("reuses the caller-owned result and makes every output finite for invalid inputs", () => {
    const invalidProfile: WaterOpticalProfile = {
      absorptionCoefficient: [Number.NaN, -1, Number.POSITIVE_INFINITY],
      scatteringColor: [Number.NaN, -1, Number.POSITIVE_INFINITY],
      scatteringCoefficient: Number.NaN,
      maximumViewDistance: Number.NaN,
      maximumSurfaceOpticalDistance: Number.POSITIVE_INFINITY,
      indexOfRefraction: Number.NaN,
      refractionStrength: Number.NaN,
      roughness: Number.NaN,
      reflectionIntensity: Number.POSITIVE_INFINITY
    };
    const result = createWaterSurfaceOpticsResult();
    const transmittance = result.transmittance;
    const scattering = result.scattering;
    const transmittedColor = result.transmittedColor;
    const finalColor = result.finalColor;
    const returned = evaluateWaterSurfaceOptics(
      invalidProfile,
      Number.NaN,
      Number.NaN,
      color(Number.NaN, -1, Number.POSITIVE_INFINITY),
      color(Number.NaN, -1, Number.POSITIVE_INFINITY),
      result
    );

    expect(returned).toBe(result);
    expect(result.transmittance).toBe(transmittance);
    expect(result.scattering).toBe(scattering);
    expect(result.transmittedColor).toBe(transmittedColor);
    expect(result.finalColor).toBe(finalColor);
    const outputs = [
      result.opticalDistance,
      result.fresnelF0,
      result.fresnel,
      result.refractionStrength,
      result.roughness,
      result.reflectionIntensity,
      ...Object.values(result.transmittance),
      ...Object.values(result.scattering),
      ...Object.values(result.transmittedColor),
      ...Object.values(result.finalColor)
    ];
    expect(outputs.every(Number.isFinite)).toBe(true);
    expect(outputs.every((value) => value >= 0)).toBe(true);
    expect(result.refractionStrength).toBe(1);
    expect(result.roughness).toBe(0);
    expect(result.reflectionIntensity).toBe(4);
  });
});
