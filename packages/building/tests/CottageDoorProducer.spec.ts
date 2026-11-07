import { describe, expect, it } from "vitest";
import { recoveredCottageDoorPlacement } from "../src/building/runtime/RecoveredCottageWallPlacement";
import { RoofCurve } from "../src/building/runtime/RecoveredRoofMath";

describe("Cottage door original chord placement and wood cuts", () => {
  it("uses the chord midpoint without window offsets, and owns the published pose", () => {
    const curve = new RoofCurve([
      [0, 0],
      [0, 8],
      [8, 8],
      [8, 0],
      [0, 0]
    ]);
    const out = recoveredCottageDoorPlacement(
      { kind: "curve", curve, closed: true, wallX: 4, pivotY: 3, collisionWidth: 2 },
      2,
      [1.2, 0.8, 1]
    );
    expect(out.frame.position).toEqual([0, 3, 4]);
    expect(out.windowCut.origin).toEqual([0, 3, 4]);
    expect(out.windowCut.layer).toBe(10);
    expect(out.windowCut.normalXZ[0]).toBeCloseTo(-1, 6);
    expect(out.windowCut.normalXZ[1]).toBeCloseTo(0, 6);
    out.frame.position[0] = 10;
    expect(out.windowCut.origin).toEqual([0, 3, 4]);
    expect(out.windowCut.scaleXY).toEqual([Math.fround(1.2), Math.fround(0.8)]);
  });
});
