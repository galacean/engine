import { expect, it, vi } from "vitest";
import {
  readRockColorBlend,
  retireRockPaletteFields,
  rockPaletteHexToLinear,
  rockPaletteLinearToHex
} from "@galacean/engine-world-planning/integrations/terrain/rock-formation/ColorPalette";
import { setRockColorBlend } from "@galacean/engine-world-planning/integrations/terrain/rock-formation/ColorMaterial";

it("defaults to the source stone tint and preserves explicitly authored channels", () => {
  const { color } = readRockColorBlend();
  expect(rockPaletteLinearToHex(color)).toBe("#96967a");
  expect(readRockColorBlend({ "color.r": 0, "color.b": 0.24 }).color).toEqual([0, color[1], 0.24]);
  expect(readRockColorBlend({ "color.r": 1, "color.g": 1, "color.b": 1 }).color).toEqual([1, 1, 1]);
  color[0] = 0;
  expect(rockPaletteLinearToHex(readRockColorBlend().color)).toBe("#96967a");
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
    expect.objectContaining({ x: 0, y: 0.5, z: readRockColorBlend().color[2] })
  );
  expect(data.setFloat).not.toHaveBeenCalled();
  expect(data.setTexture).not.toHaveBeenCalled();
});
