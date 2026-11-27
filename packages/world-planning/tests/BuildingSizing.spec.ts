import { describe, expect, it } from "vitest";
import {
  applyBuildingSize,
  resolveBuildingPolicy,
  sampleBuildingSize
} from "../src/planning-data/BuildingSizing";

describe("building dimensions", () => {
  it("uses the initial footprint distribution at random endpoints and biases, with consistent storeys", () => {
    const policy = resolveBuildingPolicy();
    const dimensions = [];
    for (const width of [0, 0.1, 0.5, 0.9, 1]) {
      for (const area of [0, 0.1, 0.5, 0.9, 1]) {
        for (const bias of [0, 0.5, 1]) {
          const sample = (key: string) => (key === "width" ? width : key === "area" ? area : 1);
          const result = sampleBuildingSize(sample, bias, policy);
          expect(sampleBuildingSize(sample, bias, policy)).toEqual(result);
          expect(result.width).toBeGreaterThanOrEqual(8 - 1e-8);
          expect(result.width).toBeLessThanOrEqual(12 + 1e-8);
          expect(result.depth).toBeGreaterThanOrEqual(8 - 1e-8);
          expect(result.depth).toBeLessThanOrEqual(12 + 1e-8);
          expect(result.width * result.depth).toBeGreaterThanOrEqual(89 - 1e-8);
          expect(result.width * result.depth).toBeLessThanOrEqual(144 + 1e-8);
          expect(result.floorCount).toBe(3);
          expect(result.floorHeightsM).toEqual([4, 4, 4]);
          expect(result.height).toBe(12);
          dimensions.push([result.width, result.depth]);
        }
      }
    }
    expect(new Set(dimensions.map((value) => value.join(","))).size).toBeGreaterThan(20);
    expect(sampleBuildingSize(() => 0).floorHeightsM).toEqual([3.5]);
  });

  it("overrides metric bounds and multiplies scope scales exactly once, including precise instance edits", () => {
    const global = { scale: 2, floorHeightMinM: 5, floorHeightMaxM: 6 };
    const village = { scale: 1.5, floorHeightMinM: 4 };
    const policy = resolveBuildingPolicy(global, village);
    expect(policy.scale).toBe(3);
    expect(policy.floorHeightMinM).toBe(4);
    expect(policy.floorHeightMaxM).toBe(6);
    const generated = sampleBuildingSize(() => 0.5, 0.5, policy);
    const unscaled = sampleBuildingSize(() => 0.5, 0.5, { ...policy, scale: 1 });
    expect(generated.width).toBeCloseTo(unscaled.width * 3, 10);
    expect(generated.depth).toBeCloseTo(unscaled.depth * 3, 10);
    expect(generated.height).toBeCloseTo(unscaled.height * 3, 10);
    const edited = applyBuildingSize(generated, { widthM: 10, floorHeightM: 4, floorCount: 3, scale: 0.5 }, 3);
    expect(edited.width).toBe(15);
    expect(edited.depth).toBeCloseTo(generated.depth * 0.5, 10);
    expect(edited.floorHeightsM).toEqual([6, 6, 6]);
    expect(edited.height).toBe(18);
    expect(edited.sizingScale).toBe(1.5);
    expect(global).toEqual({ scale: 2, floorHeightMinM: 5, floorHeightMaxM: 6 });
    expect(village).toEqual({ scale: 1.5, floorHeightMinM: 4 });
    expect(applyBuildingSize(generated, {}, 3)).toEqual(generated);
  });

  it("allows dimensions beyond the initial area distribution while validating metric ranges and storeys", () => {
    const policy = resolveBuildingPolicy({
      widthMinM: 20,
      widthMaxM: 30,
      depthMinM: 20,
      depthMaxM: 40,
      floorHeightMinM: 8,
      floorHeightMaxM: 10,
      floorsMin: 8,
      floorsMax: 12
    });
    const result = sampleBuildingSize(() => 0.5, 0.5, policy);
    expect(result.width).toBeGreaterThanOrEqual(20);
    expect(result.width).toBeLessThanOrEqual(30);
    expect(result.depth).toBeGreaterThanOrEqual(20);
    expect(result.depth).toBeLessThanOrEqual(40);
    expect(result.height).toBe(90);
    const enlarged = sampleBuildingSize(
      () => 0.5,
      0.5,
      resolveBuildingPolicy({
        widthMinM: 20,
        widthMaxM: 20,
        depthMinM: 20,
        depthMaxM: 20
      })
    );
    expect(enlarged.width).toBe(20);
    expect(enlarged.depth).toBe(20);
    expect(enlarged.width * enlarged.depth).toBe(400);
    const exact = applyBuildingSize(result, { widthM: 30, depthM: 30 });
    expect(exact.width * exact.depth).toBe(900);
    expect(() => resolveBuildingPolicy({ floorHeightMinM: 5, floorHeightMaxM: 4 })).toThrow();
    expect(() => resolveBuildingPolicy({ floorsMin: 1.5 })).toThrow();
    expect(() => applyBuildingSize(result, { widthM: 0 })).toThrow();
  });
});
