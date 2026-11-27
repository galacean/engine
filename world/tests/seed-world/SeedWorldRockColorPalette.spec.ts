import { expect, it } from "vitest";
import {
  readRockColorBlend,
  retireRockPaletteFields,
  rockPaletteHexToLinear,
  rockPaletteLinearToHex
} from "../../../packages/world-planning/src/integrations/terrain/rock-formation/ColorPalette.ts";
import { setRockColorBlend } from "../../../packages/world-planning/src/integrations/terrain/rock-formation/ColorMaterial.ts";

it("defaults to the white and preserves explicitly authored black channels", () => {
  const neutral = rockPaletteHexToLinear("#ffffff");
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
  const material = { baseColor: undefined };
  setRockColorBlend(material as any, readRockColorBlend({ "color.r": 0, "color.g": 0.5 }));
  expect(material.baseColor).toMatchObject({ r: 0, g: 0.5, b: 1, a: 1 });
});
