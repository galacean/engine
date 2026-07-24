import { describe, expect, it } from "vitest";
import { resolveOceanCoastalRockGroundedY } from "../../demo/ocean/OceanCoastalRockPlacement";

describe("OceanCoastalRockPlacement", () => {
  it("grounds the scanned local base with a stable bed embed", () => {
    const lowScaleY = resolveOceanCoastalRockGroundedY(-0.25, 16);
    const highScaleY = resolveOceanCoastalRockGroundedY(-0.25, 24);

    expect(lowScaleY).toBeCloseTo(-0.2994855, 6);
    expect(highScaleY).toBeCloseTo(-0.2842283, 6);
    expect(
      lowScaleY + -0.00190715491771698 * 16
    ).toBeCloseTo(-0.33, 6);
    expect(
      highScaleY + -0.00190715491771698 * 24
    ).toBeCloseTo(-0.33, 6);
  });

  it("rejects invalid placement inputs", () => {
    expect(() =>
      resolveOceanCoastalRockGroundedY(Number.NaN, 16)
    ).toThrow(/bed height must be finite/);
    expect(() =>
      resolveOceanCoastalRockGroundedY(-0.25, 0)
    ).toThrow(/Y scale must be finite and positive/);
  });
});
