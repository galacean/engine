import { describe, expect, it } from "vitest";
import { RiverNetworkCompiler } from "../../compiler/river/RiverNetworkCompiler";
import { createPoolSceneLayout } from "../../demo/decoration/PoolSceneController";
import { indoorReflectivePoolExample } from "../../demo/examples/pool/indoorReflectivePool";

describe("PoolSceneController layout", () => {
  it("derives a deterministic rectangular shell from the compiled corridor", () => {
    const data = RiverNetworkCompiler.compile(indoorReflectivePoolExample.riverDescriptor).data!;
    const layout = createPoolSceneLayout(data);

    expect(layout).toBeDefined();
    expect(createPoolSceneLayout(data)).toEqual(layout);
    expect(layout!.length).toBeCloseTo(64, 3);
    expect(layout!.width).toBeCloseTo(26, 3);
    expect(layout!.depth).toBeCloseTo(2.6, 2);
    expect(layout!.rotationY).toBeCloseTo(0, 6);
    expect(layout!.position[1]).toBeGreaterThan(-0.01);
  });
});
