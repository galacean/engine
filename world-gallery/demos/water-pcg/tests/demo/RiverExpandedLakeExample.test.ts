import { describe, expect, it } from "vitest";
import { RiverNetworkCompiler } from "../../compiler/river/RiverNetworkCompiler";
import { WaterDecorationStyle } from "../../demo/decoration/constants";
import { waterPcgExamples } from "../../demo/examples";
import { riverExpandedLakeExample } from "../../demo/examples/lake/riverExpandedLake";

describe("river-expanded lake example", () => {
  it("compiles a calm broad basin from the current River descriptor", () => {
    const result = RiverNetworkCompiler.compile(riverExpandedLakeExample.riverDescriptor);
    const reach = result.data?.reaches[0];
    const sampleWidths = reach?.artifact.samples.map((sample) => sample.width) ?? [];
    const sampleFlowSpeeds = reach?.artifact.samples.map((sample) => sample.flowSpeed) ?? [];

    expect(result.valid).toBe(true);
    expect(result.data?.stats).toMatchObject({ nodeCount: 2, reachCount: 1, junctionCount: 0 });
    expect(reach).toBeDefined();
    expect(Math.max(...sampleWidths)).toBeGreaterThanOrEqual(49);
    expect(Math.min(...sampleFlowSpeeds)).toBeLessThanOrEqual(0.11);
    expect(reach!.artifact.samples[0].width).toBeLessThan(10);
    expect(reach!.artifact.samples.at(-1)!.width).toBeLessThan(10);
  });

  it("uses a symmetric rounded width profile and lake decorations", () => {
    const points = riverExpandedLakeExample.riverDescriptor.segments[0].curve.points;

    expect(points.slice(2, -2).map((point) => point.width)).toEqual([12, 24, 38, 47, 50, 47, 38, 24, 12]);
    expect(riverExpandedLakeExample.decorationStyle).toBe(WaterDecorationStyle.Lake);
  });

  it("registers the lake case in the gallery", () => {
    expect(waterPcgExamples.map((example) => example.id)).toContain(riverExpandedLakeExample.id);
  });
});
