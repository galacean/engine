import { it, expect } from "vitest";
import { normalizeProfileFootprint } from "../src/building/runtime/ProfileParameters";
import { profileShape, publishProfileWall } from "../src/building/runtime/ProfileGeometry";
import { profileWallEnvelope } from "../src/building/runtime/ConstructionWallEnvelope";

it("wall support does not require a house or a roof", () => {
  const footprint = normalizeProfileFootprint({ circle: { center: [0, 0], radius: 3 } });
  const profile = publishProfileWall(
    { shape: profileShape(footprint), height: 2 },
    () => 0,
    true,
    profileWallEnvelope(footprint)
  );
  expect(profile.wallRoofJoint).toBeUndefined();
  expect(profile.topY).toBeCloseTo(1.54, 6);
  expect(profile.top.every((y) => y === profile.topY)).toBe(true);
  expect(profile.gable).toBeNull();
});
