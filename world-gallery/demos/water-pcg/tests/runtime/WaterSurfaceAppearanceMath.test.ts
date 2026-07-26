import { describe, expect, it } from "vitest";
import {
  evaluateWaterSurfaceAppearanceRefractionUvDelta,
  evaluateWaterSurfaceCoastalAlpha,
  evaluateWaterSurfaceDepthTintFactor,
  mixWaterSurfaceAppearanceLinearRgba,
  type WaterSurfaceAppearanceLinearRgba,
  type WaterSurfaceAppearanceUvDelta
} from "../../runtime/surface/WaterSurfaceAppearanceMath";

describe("WaterSurfaceAppearanceMath", () => {
  it("matches the frozen 10m power-depth curve at the calibration steps", () => {
    const samples = [0, 0.5, 2, 5, 10].map((depth) => evaluateWaterSurfaceDepthTintFactor(depth, 10, 0.5));

    expect(samples[0]).toBe(0);
    expect(samples[1]).toBeCloseTo(Math.sqrt(0.05), 12);
    expect(samples[2]).toBeCloseTo(Math.sqrt(0.2), 12);
    expect(samples[3]).toBeCloseTo(Math.sqrt(0.5), 12);
    expect(samples[4]).toBe(1);
    expect(samples.every(Number.isFinite)).toBe(true);
    expect(samples.every((value) => value >= 0 && value <= 1)).toBe(true);
    expect(samples.every((value, index) => index === 0 || value >= samples[index - 1])).toBe(true);
  });

  it("mixes linear RGBA into the caller-owned output", () => {
    const source: WaterSurfaceAppearanceLinearRgba = {
      red: 0.8,
      green: 0.6,
      blue: 0.4,
      alpha: 0.2
    };
    const tint: WaterSurfaceAppearanceLinearRgba = {
      red: 0.2,
      green: 0.4,
      blue: 0.6,
      alpha: 1
    };
    const out: WaterSurfaceAppearanceLinearRgba = { red: 0, green: 0, blue: 0, alpha: 0 };

    expect(mixWaterSurfaceAppearanceLinearRgba(source, tint, 0.25, out)).toBe(out);
    expect(out.red).toBeCloseTo(0.65, 12);
    expect(out.green).toBeCloseTo(0.55, 12);
    expect(out.blue).toBeCloseTo(0.45, 12);
    expect(out.alpha).toBeCloseTo(0.4, 12);
  });

  it("matches the frozen 0.5m coastal-alpha ramp", () => {
    expect(evaluateWaterSurfaceCoastalAlpha(0, 0.5)).toBe(0);
    expect(evaluateWaterSurfaceCoastalAlpha(0.25, 0.5)).toBe(0.5);
    expect(evaluateWaterSurfaceCoastalAlpha(0.5, 0.5)).toBe(1);
  });

  it("applies the 0.1 refraction strength directly and reuses the output", () => {
    const out: WaterSurfaceAppearanceUvDelta = { x: 0, y: 0 };
    expect(evaluateWaterSurfaceAppearanceRefractionUvDelta({ x: 0.25, y: -0.5 }, 0.1, out)).toBe(out);
    expect(out.x).toBeCloseTo(0.025, 12);
    expect(out.y).toBeCloseTo(-0.05, 12);
  });

  it("keeps scalar masks finite and bounded for invalid and extreme inputs", () => {
    const invalidDepths = [Number.NEGATIVE_INFINITY, -1, Number.NaN];
    for (const depth of invalidDepths) {
      expect(evaluateWaterSurfaceDepthTintFactor(depth, 10, 0.5)).toBe(0);
      expect(evaluateWaterSurfaceCoastalAlpha(depth, 0.5)).toBe(0);
    }
    expect(evaluateWaterSurfaceDepthTintFactor(Number.POSITIVE_INFINITY, 10, 0.5)).toBe(0);
    expect(evaluateWaterSurfaceCoastalAlpha(Number.POSITIVE_INFINITY, 0.5)).toBe(0);
    expect(evaluateWaterSurfaceDepthTintFactor(2, 0, 0.5)).toBe(0);
    expect(evaluateWaterSurfaceDepthTintFactor(2, Number.NaN, 0.5)).toBe(0);
    expect(evaluateWaterSurfaceDepthTintFactor(2, 10, Number.NaN)).toBe(0);
    expect(evaluateWaterSurfaceCoastalAlpha(0.25, Number.POSITIVE_INFINITY)).toBe(0);
  });

  it("sanitizes invalid color and UV inputs without clamping valid HDR or replacing caller outputs", () => {
    const colorOut: WaterSurfaceAppearanceLinearRgba = { red: 0, green: 0, blue: 0, alpha: 0 };
    const source: WaterSurfaceAppearanceLinearRgba = {
      red: Number.NaN,
      green: -1,
      blue: 0.25,
      alpha: Number.NEGATIVE_INFINITY
    };
    const tint: WaterSurfaceAppearanceLinearRgba = {
      red: Number.POSITIVE_INFINITY,
      green: 0.75,
      blue: 2,
      alpha: 1
    };

    expect(mixWaterSurfaceAppearanceLinearRgba(source, tint, Number.POSITIVE_INFINITY, colorOut)).toBe(colorOut);
    expect(colorOut).toEqual({ red: 0, green: 0.75, blue: 2, alpha: 1 });
    expect(mixWaterSurfaceAppearanceLinearRgba(source, tint, Number.NaN, colorOut)).toBe(colorOut);
    expect(colorOut).toEqual({ red: 0, green: -1, blue: 0.25, alpha: 0 });

    const uvOut: WaterSurfaceAppearanceUvDelta = { x: 1, y: 1 };
    expect(
      evaluateWaterSurfaceAppearanceRefractionUvDelta({ x: Number.NaN, y: Number.POSITIVE_INFINITY }, -1, uvOut)
    ).toBe(uvOut);
    expect(uvOut).toEqual({ x: 0, y: 0 });
    evaluateWaterSurfaceAppearanceRefractionUvDelta({ x: 0.25, y: -0.5 }, Number.POSITIVE_INFINITY, uvOut);
    expect(uvOut).toEqual({ x: 0, y: 0 });
    expect(Object.values(uvOut).every(Number.isFinite)).toBe(true);
  });
});
