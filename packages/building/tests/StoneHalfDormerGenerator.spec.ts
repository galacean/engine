import { constructionGeometry } from "./fixtures/constructionGeometry";
import { describe, it, expect } from "vitest";
import { recoveredArrowWallPlacement } from "../src/building/runtime/RecoveredArrowWallPlacement";
import type { WallConnectionShape } from "../src/building/runtime/WallConnectionTypes";
import { shapeCurve } from "../src/building/runtime/RecoveredWallConnectionHoles";
import { cottageXzProjectiveRotation } from "../src/building/runtime/RecoveredCottageRoofSampler";
import { RoofCurve } from "../src/building/runtime/RecoveredRoofMath";

function input(circle = false, wooden = false) {
  const shape: WallConnectionShape = circle
    ? { type: "circle" as const, center: [0, 0], radius: 2, phase: 0 }
    : { type: "rectangle" as const, center: [0, 0], width: 8, depth: 6, orientation: [1, 0] };
  const curve = shapeCurve(shape),
    wallX = curve.length * 0.125,
    point = curve.sample(0.125),
    tangent = curve.tangent(0.125);
  const placement = {
    rank: 2 as 1 | 2 | 3,
    curve,
    wallX,
    pivotY: 4,
    closed: true,
    wooden,
    halfTimber: false,
    foundationHeight: 0,
    baseY: 0,
    wallMaxY: 4.2,
    bottomSamples: [0],
    wallSlot: 7,
    seed: 42,
    circleRadius: circle ? 2 : undefined
  };
  const cachedTransform = {
    translation: [point[0], 4, point[1]],
    rotation: cottageXzProjectiveRotation([-tangent[1], 0, tangent[0]]),
    scale: [1, 1, 1]
  };
  const host = {
    surface: {
      type: circle ? ("native_circular_roof_profile" as const) : ("native_rectangular_roof_profile" as const),
      tip_offset: [0, 0],
      profile: 0.5,
      height_parameter: 0.9,
      ridge_parameter: 0.3,
      eave_parameter: 0.2,
      axis: 0,
      edge_mode: 0,
      base_height: 4.2
    },
    footprint: circle
      ? { center: [0, 0], radius: 2, phase: 0 }
      : { center: [0, 0], orientation: [1, 0], width: 8, depth: 6 }
  };
  return { placement, cachedTransform, host };
}
describe("stone half dormer assembled producer", () => {
  it("keeps arrow wood flags/depth and raw roof bones distinct from visual bones", () => {
    const { placement } = input(true, true),
      p = recoveredArrowWallPlacement(constructionGeometry.decorationCollisions, placement);
    expect(p.instance.flags).toBe(3);
    expect(p.instance.clipY).toBe(Math.fround(placement.wallMaxY));
    expect(p.scale[2]).toBe(Math.fround(1.07));
    expect(p.instance.bones).not.toBe(p.profileBones);
    expect(p.instance.xform.slice(9)).toEqual(p.origin);
    const straight = recoveredArrowWallPlacement(constructionGeometry.decorationCollisions, {
      ...placement,
      circleRadius: undefined,
      curve: new RoofCurve([
        [0, 0],
        [10, 0]
      ]),
      wallX: 5,
      wooden: false
    });
    expect(straight.origin).toEqual([5, 4, 0]);
    expect(straight.instance.flags).toBe(0);
    expect(straight.instance.clipY).toBe(-100000);
    const width = straight.profileBones[2].position[0] - straight.profileBones[0].position[0];
    expect(width).toBeCloseTo(0.75, 6);
    expect(straight.instance.wallRange[1] - straight.instance.wallRange[0]).toBeCloseTo(0.4, 6);
  });
});
