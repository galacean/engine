import { describe, expect, it } from "vitest";
import { RiverChunkSourceKind, RiverLocalMapRegionKind } from "../../compiler/river/RiverGeometryEnums";
import { RiverNetworkCompiler } from "../../compiler/river/RiverNetworkCompiler";
import { createRiverLocalCurrentSample, RiverLocalCurrentSampler } from "../../runtime/river/RiverLocalCurrentSampler";
import { multiTributaryRiverExample } from "../../demo/examples/river/multiTributaryRiver";

describe("RiverLocalCurrentSampler", () => {
  it("bilinearly decodes confluence RG and blends it with the base current like the shader", () => {
    const data = RiverNetworkCompiler.compile(multiTributaryRiverExample.riverDescriptor).data!;
    const atlas = data.terrainInteraction.localMapAtlas!;
    const tile = atlas.tiles.find((candidate) => candidate.kind === RiverLocalMapRegionKind.Confluence)!;
    const junction = data.junctions[tile.sourceIndex];
    const baseFlowX = junction.flowDirection[0] * junction.flowSpeed;
    const baseFlowZ = junction.flowDirection[2] * junction.flowSpeed;
    const output = createRiverLocalCurrentSample();
    const sampler = new RiverLocalCurrentSampler(atlas);

    expect(
      sampler.sample(
        RiverChunkSourceKind.Junction,
        tile.sourceIndex,
        junction.position[0],
        junction.position[2],
        baseFlowX,
        baseFlowZ,
        output
      )
    ).toBe(true);
    expect(output.tileIndex).toBeGreaterThanOrEqual(0);
    expect(output.localFlowWeight).toBeGreaterThan(0);
    expect(Math.hypot(output.finalFlowX, output.finalFlowZ)).toBeCloseTo(junction.flowSpeed, 5);
    expect(output.normalizedSignedDistance).toBeGreaterThan(0);
    expect(sampler.sampleCount).toBe(1);
    expect(sampler.appliedCount).toBe(1);
  });

  it("keeps the ordinary reach fast path unchanged when no tile contains the query", () => {
    const data = RiverNetworkCompiler.compile(multiTributaryRiverExample.riverDescriptor).data!;
    const atlas = data.terrainInteraction.localMapAtlas!;
    const output = createRiverLocalCurrentSample();
    const sampler = new RiverLocalCurrentSampler(atlas);

    expect(sampler.sample(RiverChunkSourceKind.Reach, 0, 10000, 10000, 1.2, -0.4, output)).toBe(false);
    expect(output.finalFlowX).toBe(1.2);
    expect(output.finalFlowZ).toBe(-0.4);
    expect(output.localFlowWeight).toBe(0);
  });
});
