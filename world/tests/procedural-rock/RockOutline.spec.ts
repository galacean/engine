import { expect, it } from "vitest";
import { makeConstrainedRockOutline } from "@galacean/engine-terrain/rock-formation/generator/outline.js";

it.each([
  { seed: 1, aspect: 1, taper: 0.4, notches: 2, notchWidth: 0.038, notchDepth: 0.145 },
  { seed: 998, aspect: 1, taper: -0.4, wave: 0.12, chip: 0.04, scale: 0.04 },
  { seed: 4248, aspect: 3, taper: 0.4, notches: 8, notchWidth: 0.16, notchDepth: 0.24 }
])("keeps both interior and exterior turns within the accepted bounds: %j", (parameters) => {
  const shape = makeConstrainedRockOutline(parameters);
  expect(shape.stats.angles.minInterior).toBeGreaterThanOrEqual(90 - 1e-6);
  expect(shape.stats.angles.maxInterior).toBeLessThanOrEqual(270 + 1e-6);
  expect(shape.stats.angles.maxFeatureTurn).toBeLessThanOrEqual(90 + 1e-6);
  expect(shape.stats.notchPeak).toBeGreaterThan(0);
  expect(shape.contour.every((point) => point.every(Number.isFinite))).toBe(true);
});

it("retains at least one nonzero notch and gives a reproducible seeded boundary", () => {
  const parameters = { seed: 1, notches: 0, notchWidth: 0, notchDepth: 0 };
  const first = makeConstrainedRockOutline(parameters);
  expect(first.cuts).toHaveLength(1);
  expect(first.stats.notchPeak).toBeGreaterThan(0);
  expect(first.contour).toEqual(makeConstrainedRockOutline(parameters).contour);
  expect(first.contour).not.toEqual(makeConstrainedRockOutline({ ...parameters, seed: 998 }).contour);
});
