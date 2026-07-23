import { describe, expect, it } from "vitest";
import {
  DEFAULT_WATER_OPTICAL_PROFILE,
  evaluateWaterOpticalMedium,
  type WaterOpticalColor
} from "../../runtime/optics/WaterOpticalProfile";

function color(red = 1, green = 1, blue = 1): WaterOpticalColor {
  return { red, green, blue };
}

describe("WaterOpticalProfile", () => {
  it("preserves source colour at zero distance and attenuates it through water", () => {
    const source = color();
    const output = color(0, 0, 0);

    expect(evaluateWaterOpticalMedium(DEFAULT_WATER_OPTICAL_PROFILE, 0, source, output)).toBe(output);
    expect(output).toEqual(source);
    evaluateWaterOpticalMedium(DEFAULT_WATER_OPTICAL_PROFILE, 12, source, output);
    expect(output.red).toBeLessThan(source.red);
    expect(output.green).toBeLessThan(source.green);
    expect(output.blue).toBeLessThanOrEqual(source.blue);
  });

  it("clamps non-finite and over-range distances to the profile budget", () => {
    const source = color(0.8, 0.5, 0.2);
    const atMaximum = color();
    const atInfinity = color();
    evaluateWaterOpticalMedium(
      DEFAULT_WATER_OPTICAL_PROFILE,
      DEFAULT_WATER_OPTICAL_PROFILE.maximumViewDistance,
      source,
      atMaximum
    );
    evaluateWaterOpticalMedium(DEFAULT_WATER_OPTICAL_PROFILE, Number.POSITIVE_INFINITY, source, atInfinity);
    expect(atInfinity).toEqual(atMaximum);
  });

  it("retains finite surface defaults while keeping legacy profile fields source-compatible", () => {
    expect(DEFAULT_WATER_OPTICAL_PROFILE.indexOfRefraction).toBeCloseTo(1.3483107765683295, 12);
    expect(DEFAULT_WATER_OPTICAL_PROFILE.maximumSurfaceOpticalDistance).toBe(4);
    expect(DEFAULT_WATER_OPTICAL_PROFILE.refractionStrength).toBe(1);
    expect(DEFAULT_WATER_OPTICAL_PROFILE.roughness).toBe(0);
    expect(DEFAULT_WATER_OPTICAL_PROFILE.reflectionIntensity).toBe(1);

    const legacyProfile = {
      absorptionCoefficient: [0.2, 0.1, 0.05] as const,
      scatteringColor: [0.02, 0.04, 0.08] as const,
      scatteringCoefficient: 0.1,
      maximumViewDistance: 20
    };
    const output = color();
    expect(evaluateWaterOpticalMedium(legacyProfile, 2, color(), output)).toBe(output);
    expect(Object.values(output).every(Number.isFinite)).toBe(true);
  });

  it("sanitizes invalid medium inputs without producing NaN or Infinity", () => {
    const invalidProfile = {
      absorptionCoefficient: [Number.NaN, -1, Number.POSITIVE_INFINITY] as const,
      scatteringColor: [Number.NaN, -1, Number.POSITIVE_INFINITY] as const,
      scatteringCoefficient: Number.NaN,
      maximumViewDistance: Number.NaN
    };
    const output = color(Number.NaN, Number.NaN, Number.NaN);
    evaluateWaterOpticalMedium(invalidProfile, Number.NaN, color(Number.NaN, -1, Number.POSITIVE_INFINITY), output);

    expect(Object.values(output).every(Number.isFinite)).toBe(true);
    expect(Object.values(output).every((value) => value >= 0)).toBe(true);
  });
});
