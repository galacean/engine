import { expect, it } from "vitest";
import { generateTerrainTexture } from "@galacean/engine-terrain/terrain/tools/TerrainTextureGenerator";

it("generates repeatable, non-uniform RGBA albedo from an explicit recipe", () => {
  const recipe = {
    size: 32,
    seed: 129,
    low: [0.08, 0.14, 0.02],
    high: [0.2, 0.45, 0.12],
    frequency: 4,
    colorSpace: "sRGB"
  } as const;
  const pixels = generateTerrainTexture(recipe);
  expect(pixels.length).toBe(32 * 32 * 4);
  expect(new Set(pixels.filter((_, index) => index % 4 === 0)).size).toBeGreaterThan(5);
  expect(pixels.filter((_, index) => index % 4 === 3).every((alpha) => alpha === 255)).toBe(true);
  expect(generateTerrainTexture(recipe)).toEqual(pixels);
  expect(generateTerrainTexture({ ...recipe, seed: 130 })).not.toEqual(pixels);
});
