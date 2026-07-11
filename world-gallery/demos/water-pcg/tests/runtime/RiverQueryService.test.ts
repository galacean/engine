import { Vector3 } from "@galacean/engine-math";
import { describe, expect, it } from "vitest";
import { RiverGeometryCompiler } from "../../compiler/river/RiverGeometryCompiler";
import { sampleRiverPath } from "../../compiler/river/RiverPathSampler";
import { queryRiver } from "../../runtime/river/RiverQueryService";
import type { RiverDemoConfig as RiverConfig } from "../../demo/types";
import { straightFixture, variableProfileFixture } from "../fixtures/riverFixtures";

describe("WaterQuery flow contract", () => {
  it("preserves zero flow as a true stopped-water value", () => {
    const config: RiverConfig = {
      ...straightFixture,
      flow: { ...straightFixture.flow, speed: 0 },
      path: {
        ...straightFixture.path,
        points: straightFixture.path.points.map((point) => ({ ...point, flowSpeed: undefined }))
      }
    };
    const sampleResult = sampleRiverPath(config);
    const source = RiverGeometryCompiler.compile(sampleResult, config.quality.material.level).querySource;
    const result = queryRiver(source, new Vector3(5, 0, 0));

    expect(result.inWater).toBe(true);
    expect(result.flowSpeed).toBe(0);
  });

  it("returns the same authored local flow profile encoded by sampled geometry", () => {
    const samples = sampleRiverPath(variableProfileFixture).points;
    const anchor = variableProfileFixture.path.points[1];
    const anchorSample = samples.find(
      (sample) =>
        sample.position.x === anchor.position[0] &&
        sample.position.y === anchor.position[1] &&
        sample.position.z === anchor.position[2]
    );
    if (!anchorSample) throw new Error("Expected preserved anchor sample.");
    const source = RiverGeometryCompiler.compile(
      { points: samples, totalLength: samples.at(-1)?.distance ?? 0, diagnostics: [] },
      variableProfileFixture.quality.material.level
    ).querySource;
    const result = queryRiver(source, anchorSample.position);

    expect(result.flowSpeed).toBeCloseTo(anchor.flowSpeed!);
  });
});
