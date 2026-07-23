import { describe, expect, it } from "vitest";
import { RiverQualityLevel } from "../../authoring/river/RiverAuthoringEnums";
import { RiverNetworkCompiler } from "../../compiler/river/RiverNetworkCompiler";
import { showcaseRiverExample } from "../../demo/examples/river/showcaseRiver";

describe("showcaseRiverExample", () => {
  it("combines a High downhill network and one Y confluence in the production compiler", () => {
    const descriptor = showcaseRiverExample.riverDescriptor;
    const result = RiverNetworkCompiler.compile(descriptor);

    expect(result.valid).toBe(true);
    expect(result.data?.stats).toMatchObject({
      nodeCount: 4,
      reachCount: 3,
      sourceCount: 2,
      junctionCount: 1
    });
    expect(descriptor.defaults.quality.material.level).toBe(RiverQualityLevel.High);
    expect((descriptor.nodes[0]?.elevation ?? 0) - (descriptor.nodes.at(-1)?.elevation ?? 0)).toBeGreaterThanOrEqual(
      12
    );
    expect(result.data?.stats.localMapRegionCount).toBeGreaterThan(0);
    expect(descriptor.defaults.material.foamIntensity).toBeGreaterThanOrEqual(0.9);
    expect("disturbances" in descriptor ? descriptor.disturbances : []).toHaveLength(4);
  });
});
