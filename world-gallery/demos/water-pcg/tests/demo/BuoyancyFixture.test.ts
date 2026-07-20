import { Vector3 } from "@galacean/engine-math";
import { describe, expect, it } from "vitest";
import {
  BUOYANCY_MAX_PONTOONS,
  BUOYANCY_PROFILE_SAMPLE_CAPACITY,
  FlatWaterSurfaceProvider,
  RIVER_FOUR_FIXTURE,
  STATIC_SINGLE_FIXTURE,
  STATIC_SINGLE_EXPECTED_BODY_HEIGHT,
  createBuoyancyProfilePontoons,
  parseBuoyancyScenario,
  parseBuoyancySurfaceTime,
  summarizeProfile
} from "../../demo/buoyancy/buoyancyFixture";
import { createWaterSurfaceSample } from "../../runtime/query/WaterSurfaceProvider";

describe("buoyancy fixtures", () => {
  it("provides the P0 single and four-Pontoon scenarios within the hard limit", () => {
    expect(STATIC_SINGLE_FIXTURE.createPontoons()).toHaveLength(1);
    expect(RIVER_FOUR_FIXTURE.createPontoons()).toHaveLength(4);
    expect(RIVER_FOUR_FIXTURE.createPontoons().length).toBeLessThanOrEqual(BUOYANCY_MAX_PONTOONS);
    expect(STATIC_SINGLE_FIXTURE.buoyancyCoefficient).toBe(2);
  });

  it("creates fresh Pontoon vectors for every reset", () => {
    const first = RIVER_FOUR_FIXTURE.createPontoons();
    const second = RIVER_FOUR_FIXTURE.createPontoons();
    expect(first).not.toBe(second);
    expect(first[0].localPosition).not.toBe(second[0].localPosition);
    expect(createBuoyancyProfilePontoons(4)).toHaveLength(4);
    expect(createBuoyancyProfilePontoons(8)).toHaveLength(BUOYANCY_MAX_PONTOONS);
    expect(STATIC_SINGLE_EXPECTED_BODY_HEIGHT).toBeCloseTo(-STATIC_SINGLE_FIXTURE.createPontoons()[0].localPosition.y);
  });

  it("samples a bounded static surface without replacing output vectors", () => {
    const provider = new FlatWaterSurfaceProvider();
    const sample = createWaterSurfaceSample();
    const surfacePosition = sample.surfacePosition;
    const surfaceNormal = sample.surfaceNormal;
    const waterVelocity = sample.waterVelocity;

    expect(provider.sampleSurface(new Vector3(-7, 2, 0), sample)).toBe(true);
    expect(sample.waterBodyId).toBe("buoyancy-static-surface");
    expect(sample.surfacePosition).toEqual(new Vector3(-7, 0, 0));
    expect(sample.surfaceNormal).toEqual(new Vector3(0, 1, 0));
    expect(sample.waterDepth).toBe(6);
    expect(sample.surfacePosition).toBe(surfacePosition);
    expect(sample.surfaceNormal).toBe(surfaceNormal);
    expect(sample.waterVelocity).toBe(waterVelocity);

    expect(provider.sampleSurface(new Vector3(20, 0, 0), sample)).toBe(false);
    expect(sample.waterBodyId).toBe("");
  });

  it("uses River as the default scenario and calculates stable profile percentiles", () => {
    expect(parseBuoyancyScenario(null)).toBe("river-four");
    expect(parseBuoyancyScenario("static-single")).toBe("static-single");
    expect(summarizeProfile([4, 1, 3, 2, Number.NaN])).toEqual({
      p50Ms: 2,
      p95Ms: 4,
      maxMs: 4,
      sampleCount: 5
    });
    expect(summarizeProfile([])).toEqual({ p50Ms: 0, p95Ms: 0, maxMs: 0, sampleCount: 0 });

    const fixedCapacitySamples = new Float64Array(BUOYANCY_PROFILE_SAMPLE_CAPACITY);
    fixedCapacitySamples.set([4, 1, 3, 2, Number.NaN]);
    expect(summarizeProfile(fixedCapacitySamples, 5)).toEqual({
      p50Ms: 2,
      p95Ms: 4,
      maxMs: 4,
      sampleCount: 5
    });
    expect(summarizeProfile(fixedCapacitySamples, 0)).toEqual({
      p50Ms: 0,
      p95Ms: 0,
      maxMs: 0,
      sampleCount: 0
    });
  });

  it("accepts only finite non-negative fixed surface times", () => {
    expect(parseBuoyancySurfaceTime("12.5")).toBe(12.5);
    expect(parseBuoyancySurfaceTime("0")).toBe(0);
    expect(parseBuoyancySurfaceTime(null)).toBeUndefined();
    expect(parseBuoyancySurfaceTime("")).toBeUndefined();
    expect(parseBuoyancySurfaceTime("-1")).toBeUndefined();
    expect(parseBuoyancySurfaceTime("Infinity")).toBeUndefined();
    expect(parseBuoyancySurfaceTime("not-a-number")).toBeUndefined();
  });
});
