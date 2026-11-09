import { expect, it } from "vitest";
import { gothicRoofFrameAttributes } from "../src/building/runtime/GothicBlueprint";

const f32 = Math.fround;

it("full roof frame uses the original rank width and distinguishes style from wall material", () => {
  for (const [rank, width] of [
    [1, 0.72],
    [2, 1.2],
    [3, 1.54]
  ] as const) {
    const attributes = gothicRoofFrameAttributes(rank, 0.25, 1, false);
    expect(attributes.meshSizeX).toBe(f32(width));
    expect(attributes.wallRange).toEqual([0.25, f32(0.25 + f32(width))]);
    expect(gothicRoofFrameAttributes(rank, 0.25, 1, true)).toEqual({ ...attributes, woodenWall: true });
  }
  expect(() => gothicRoofFrameAttributes(1, Infinity, 1, false)).toThrow();
  expect(() => gothicRoofFrameAttributes(1, 0.25, 0, false)).toThrow();
});

it("resizing scales the wall range but keeps the source mesh width for the shader", () => {
  for (const [rank, width] of [
    [1, 0.72],
    [2, 1.2],
    [3, 1.54]
  ] as const) {
    const attributes = gothicRoofFrameAttributes(rank, 0.25, 0.75, false);
    expect(attributes.meshSizeX).toBe(f32(width));
    expect(attributes.wallRange).toEqual([0.25, f32(0.25 + f32(f32(width) * f32(0.75)))]);
  }
});
