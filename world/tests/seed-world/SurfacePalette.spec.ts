import { describe, expect, it } from "vitest";
import {
  compileSeedWorldSurfacePalette,
  type SeedWorldSurfacePalette
} from "@galacean/engine-world-planning/runtime/SeedWorldSurfacePalette";
const layers = Array.from({ length: 4 }, (_, i) => ({
  id: `layer${i}`,
  textureUrl: `layer${i}.png`,
  tileSize: [10, 10] as const
}));
const palette: SeedWorldSurfacePalette = { layers, seed: 13, patchSizeMetres: 150 };
function setup(resolution = 128) {
  const materialWeights = new Uint8Array(resolution ** 2 * 4);
  for (let i = 0; i < materialWeights.length; i += 4) materialWeights[i] = 255;
  return { resolution, materialWeights, hash: 0 };
}
describe("whole-map surface composition", () => {
  it("is deterministic, preserves integer normalization and has no tile discontinuities", () => {
    const intent = setup();
    const result = compileSeedWorldSurfacePalette(palette, intent, intent.materialWeights, 1024, [0, 0]);
    expect(result).toEqual(compileSeedWorldSurfacePalette(palette, intent, intent.materialWeights, 1024, [0, 0]));
    let maxJump = 0;
    for (let i = 0; i < result.palette.length; i += 4) {
      expect([...result.base.slice(i, i + 4), ...result.palette.slice(i, i + 4)].reduce((a, b) => a + b)).toBe(255);
      if ((i / 4) % 128)
        for (let c = 0; c < 4; c++)
          maxJump = Math.max(maxJump, Math.abs(result.palette[i + c] - result.palette[i + c - 4]));
    }
    expect(maxJump).toBeLessThan(24);
  });
  it("does not overwrite a road even when a POI selects another layer", () => {
    const intent = setup(8);
    intent.materialWeights.fill(0);
    for (let i = 3; i < intent.materialWeights.length; i += 4) intent.materialWeights[i] = 255;
    const base = new Uint8Array(intent.materialWeights.length);
    for (let i = 2; i < base.length; i += 4) base[i] = 255;
    const result = compileSeedWorldSurfacePalette(
      { ...palette, patches: [{ ownerId: "poi1", layerId: "layer2", center: [512, 512], radius: 1000, feather: 20 }] },
      intent,
      base,
      1024,
      [0, 0]
    );
    expect(result.base).toEqual(base);
    expect(result.palette.every((v) => v === 0)).toBe(true);
  });
  it("honors POI material selection inside the core and feathers to the global mixture", () => {
    const intent = setup();
    const result = compileSeedWorldSurfacePalette(
      { ...palette, patches: [{ ownerId: "poi1", layerId: "layer2", center: [512, 512], radius: 100, feather: 32 }] },
      intent,
      intent.materialWeights,
      1024,
      [0, 0]
    );
    expect(result.palette[(64 * 128 + 64) * 4 + 2]).toBe(255);
    expect(result.palette.some((v) => v > 0 && v < 255)).toBe(true);
  });
});
