import { describe, expect, it } from "vitest";
import { RIVER_LIMITS } from "../../authoring/river/RiverAuthoringLimits";
import { RiverNetworkCompiler } from "../../compiler/river/RiverNetworkCompiler";
import { RiverChunkSourceKind } from "../../compiler/river/RiverGeometryEnums";
import type { RiverGeometryData } from "../../compiler/river/types";
import { multiTributaryRiverExample } from "../../demo/examples/river/multiTributaryRiver";
import { curvedMainRiverExample } from "../../demo/examples/river/curvedMainRiver";
import type { RiverNetworkDescriptor } from "../../authoring/river/RiverDescriptor";

function getSourceGeometry(
  sourceKind: RiverChunkSourceKind,
  sourceIndex: number,
  compiled: NonNullable<ReturnType<typeof RiverNetworkCompiler.compile>["data"]>
): RiverGeometryData {
  return sourceKind === RiverChunkSourceKind.Reach
    ? compiled.reaches[sourceIndex].artifact.surfaceGeometry
    : compiled.junctions[sourceIndex].surfaceGeometry;
}

describe("RiverChunkCompiler", () => {
  it("emits deterministic world-tile chunks with local coordinates and 16-bit-safe vertex counts", () => {
    const first = RiverNetworkCompiler.compile(multiTributaryRiverExample.riverDescriptor).data!;
    const second = RiverNetworkCompiler.compile(multiTributaryRiverExample.riverDescriptor).data!;

    expect(first.chunks.map((chunk) => chunk.id)).toEqual(second.chunks.map((chunk) => chunk.id));
    expect(first.stats.chunkCount).toBe(first.chunks.length);
    expect(first.stats.vertexCount).toBe(
      first.chunks.reduce(
        (sum, chunk) => sum + chunk.surfaceGeometry.positions.length + (chunk.bankFoamGeometry?.positions.length ?? 0),
        0
      )
    );

    for (const chunk of first.chunks) {
      expect(chunk.surfaceGeometry.positions.length).toBeLessThanOrEqual(RIVER_LIMITS.maxChunkVertexCount);
      expect(
        Array.from(chunk.surfaceGeometry.indices).every((index) => index < chunk.surfaceGeometry.positions.length)
      ).toBe(true);
      const source = getSourceGeometry(chunk.sourceKind, chunk.sourceIndex, first);
      for (const localPosition of chunk.surfaceGeometry.positions) {
        const worldPosition = [
          localPosition[0] + chunk.localOrigin[0],
          localPosition[1] + chunk.localOrigin[1],
          localPosition[2] + chunk.localOrigin[2]
        ];
        expect(
          source.positions.some(
            (position) =>
              Math.abs(position[0] - worldPosition[0]) < 1e-6 &&
              Math.abs(position[1] - worldPosition[1]) < 1e-6 &&
              Math.abs(position[2] - worldPosition[2]) < 1e-6
          )
        ).toBe(true);
      }
    }
  });

  it("splits a reach that crosses multiple world tiles", () => {
    const source = curvedMainRiverExample.riverDescriptor;
    const descriptor: RiverNetworkDescriptor = {
      ...source,
      nodes: source.nodes.map((node, index) => ({
        ...node,
        position: index === 0 ? [-220, 0.2, 0] : [220, -0.06, 0]
      })),
      segments: source.segments.map((segment) => ({
        ...segment,
        curve: {
          ...segment.curve,
          points: [
            { id: "long-start", position: [-220, 0.2, 0] },
            { id: "long-end", position: [220, -0.06, 0] }
          ]
        }
      }))
    };
    const compiled = RiverNetworkCompiler.compile(descriptor).data!;

    expect(compiled.chunks.length).toBeGreaterThan(1);
    expect(new Set(compiled.chunks.map((chunk) => `${chunk.tileX}:${chunk.tileZ}`)).size).toBeGreaterThan(1);
  });
});
