import { describe, expect, it } from "vitest";
import { RiverNetworkCompiler } from "../../compiler/river/RiverNetworkCompiler";
import { WaterDecorationStyle } from "../../demo/decoration/constants";
import { waterPcgExamples } from "../../demo/examples";
import { indoorReflectivePoolExample } from "../../demo/examples/pool/indoorReflectivePool";

describe("indoor reflective pool example", () => {
  it("compiles a calm, nearly level rectangular water surface", () => {
    const result = RiverNetworkCompiler.compile(indoorReflectivePoolExample.riverDescriptor);
    const reach = result.data?.reaches[0];
    const samples = reach?.artifact.samples ?? [];
    const elevations = samples.map((sample) => sample.position[1]);

    expect(result.valid).toBe(true);
    expect(result.data?.stats).toMatchObject({ nodeCount: 2, reachCount: 1, junctionCount: 0 });
    expect(reach).toBeDefined();
    expect(samples.every((sample) => sample.width === 26)).toBe(true);
    expect(samples.every((sample) => sample.depth === 2.6)).toBe(true);
    expect(samples.every((sample) => sample.flowSpeed === 0.04)).toBe(true);
    expect(Math.max(...elevations) - Math.min(...elevations)).toBeLessThanOrEqual(0.021);
  });

  it("uses pool decoration and reference-matched optical tuning", () => {
    const defaults = indoorReflectivePoolExample.riverDescriptor.defaults;

    expect(indoorReflectivePoolExample.decorationStyle).toBe(WaterDecorationStyle.Pool);
    expect(defaults.material.clarity).toBeGreaterThanOrEqual(0.9);
    expect(defaults.material.foamIntensity).toBeLessThanOrEqual(0.05);
    if (!("surfaceMotion" in defaults)) throw new Error("Expected pool surface motion tuning.");
    expect(defaults.surfaceMotion.displacementAmplitude).toBeLessThanOrEqual(0.05);
    expect(defaults.surfaceMotion.microNormalStrength).toBeLessThanOrEqual(0.12);
  });

  it("registers the pool case in the gallery", () => {
    expect(waterPcgExamples.map((example) => example.id)).toContain(indoorReflectivePoolExample.id);
  });
});
