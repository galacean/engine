import { describe, expect, it } from "vitest";
import example from "../src/tiny-glade/assets/examples/round-gothic.json";
import originalUnits from "../src/tiny-glade/assets/gothic-preview/units";
import { gothicRoofFrameAttributes } from "../src/tiny-glade/runtime/GothicBlueprint";

it("full roof frame uses the original rank width and distinguishes style from wall material", () => {
  for (const [rank, width] of [
    [1, 0.72],
    [2, 1.2],
    [3, 1.54]
  ] as const) {
    const attributes = gothicRoofFrameAttributes(rank, 0.25, 1, false);
    expect(attributes.meshSizeX).toBe(Math.fround(width));
    expect(attributes.wallRange).toEqual([0.25, Math.fround(0.25 + Math.fround(width))]);
    expect(gothicRoofFrameAttributes(rank, 0.25, 1, true)).toEqual({ ...attributes, woodenWall: true });
  }
  expect(() => gothicRoofFrameAttributes(1, Infinity, 1, false)).toThrow();
  expect(() => gothicRoofFrameAttributes(1, 0.25, 0, false)).toThrow();
});
