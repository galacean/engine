import { expect, it, vi } from "vitest";
import {
  readRockColorBlend,
  retireRockPaletteFields,
  rockPaletteHexToLinear,
  rockPaletteLinearToHex
} from "../../../packages/world-planning/src/integrations/terrain/rock-formation/ColorPalette.ts";
import { setRockColorBlend } from "../../../packages/world-planning/src/integrations/terrain/rock-formation/ColorMaterial.ts";

it("defaults to the accepted neutral grey and preserves explicitly authored black channels", () => {
  const neutral = rockPaletteHexToLinear("#b8bcc2");
  expect(readRockColorBlend()).toEqual({ color: neutral });
  expect(readRockColorBlend({ "color.r": 0, "color.b": 0.24 })).toEqual({ color: [0, neutral[1], 0.24] });
  const settings = readRockColorBlend();
  settings.color[0] = 0;
  expect(readRockColorBlend().color[0]).toBe(neutral[0]);
});

it("converts editor colors through sRGB exactly once", () => {
  expect(rockPaletteHexToLinear("#808080")[0]).toBeCloseTo(0.2158605001, 9);
  expect(rockPaletteLinearToHex(rockPaletteHexToLinear("#ce608c"))).toBe("#ce608c");
  expect(rockPaletteHexToLinear("#000000")).toEqual([0, 0, 0]);
  expect(rockPaletteHexToLinear("#ffffff")).toEqual([1, 1, 1]);
});

it("retires the old pigment controls without removing current color or geometry authoring", () => {
  const values = {
    "palette.summer.colorA.r": 0,
    "palette.autumn.colorB.b": 0.24,
    colorBalance: 0.3,
    colorStrength: 0.8,
    colorSaturation: 1.2,
    "color.r": 0.4,
    textureScale: 24
  };
  retireRockPaletteFields(values);
  expect(values).toEqual({ "color.r": 0.4, textureScale: 24 });
  retireRockPaletteFields(values);
  expect(values).toEqual({ "color.r": 0.4, textureScale: 24 });
});

it("binds one Color uniform without changing textures, geometry or grass", () => {
  const data = { setVector3: vi.fn(), setFloat: vi.fn(), setTexture: vi.fn() };
  setRockColorBlend({ shaderData: data } as any, readRockColorBlend({ "color.r": 0, "color.g": 0.5 }));
  expect(data.setVector3).toHaveBeenCalledExactlyOnceWith(
    "material_RockColor",
    expect.objectContaining({ x: 0, y: 0.5, z: rockPaletteHexToLinear("#b8bcc2")[2] })
  );
  expect(data.setFloat).not.toHaveBeenCalled();
  expect(data.setTexture).not.toHaveBeenCalled();
});
