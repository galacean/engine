import { describe, expect, it } from "vitest";
import { RiverPathMode } from "../../authoring/river/RiverAuthoringEnums";
import type { RiverNetworkDescriptor } from "../../authoring/river/RiverDescriptor";
import { RiverNetworkCompiler } from "../../compiler/river/RiverNetworkCompiler";
import { curvedMainRiverExample } from "../../demo/examples/river/curvedMainRiver";
import { multiTributaryRiverExample } from "../../demo/examples/river/multiTributaryRiver";

interface CompiledFootprint {
  readonly chunkCount: number;
  readonly sampleCount: number;
  readonly vertexCount: number;
}

function withPathMode(descriptor: RiverNetworkDescriptor, mode: RiverPathMode): RiverNetworkDescriptor {
  return {
    ...descriptor,
    segments: descriptor.segments.map((segment) => ({
      ...segment,
      curve: { ...segment.curve, mode }
    }))
  };
}

function measureCompile(descriptor: RiverNetworkDescriptor, mode: RiverPathMode): CompiledFootprint {
  const result = RiverNetworkCompiler.compile(withPathMode(descriptor, mode));
  expect(result.valid).toBe(true);
  const data = result.data;
  if (!data) throw new Error("Expected valid compiled river data.");
  for (const reach of data.reaches) {
    expect(reach.sampleCount).toBeLessThanOrEqual(reach.config.quality.geometry.maxSegmentCount + 1);
  }
  return {
    chunkCount: data.stats.chunkCount,
    sampleCount: data.stats.sampleCount,
    vertexCount: data.stats.vertexCount
  };
}

describe("river path-mode compilation budgets", () => {
  it.each([curvedMainRiverExample, multiTributaryRiverExample])(
    "keeps every path mode within sampling budgets for $id",
    (example) => {
      const measurements = Object.fromEntries(
        [RiverPathMode.Polyline, RiverPathMode.CatmullRom, RiverPathMode.Bezier].map((mode) => [
          mode,
          measureCompile(example.riverDescriptor, mode)
        ])
      ) as Record<RiverPathMode, CompiledFootprint>;
      const budget = example.riverDescriptor.budget;

      for (const measurement of Object.values(measurements)) {
        if (budget?.maxSampleCount !== undefined) {
          expect(measurement.sampleCount).toBeLessThanOrEqual(budget.maxSampleCount);
        }
        if (budget?.maxVertexCount !== undefined) {
          expect(measurement.vertexCount).toBeLessThanOrEqual(budget.maxVertexCount);
        }
        if (budget?.maxChunkCount !== undefined) {
          expect(measurement.chunkCount).toBeLessThanOrEqual(budget.maxChunkCount);
        }
      }
    }
  );
});
