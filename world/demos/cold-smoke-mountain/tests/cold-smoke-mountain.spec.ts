import { describe, expect, it } from "vitest";
import { generateColdSmokeMountain, strataAt, traceFallLineFeature } from "../generator";
import { createPresetRecipe } from "../model";

describe("Cold Smoke Mountain generation & guiding pipeline", () => {
  it("generates deterministic heightfields and baked channels from preset recipes", () => {
    const recipe = createPresetRecipe("hanyan-valley", 261111);
    recipe.domain.resolution = 65;
    const first = generateColdSmokeMountain(recipe);
    const second = generateColdSmokeMountain(recipe);

    expect(first.heights.length).toBe(65 * 65);
    expect(first.channels.length).toBe(65 * 65 * 4);
    expect(first.slopes.length).toBe(65 * 65 * 2);
    expect(first.diagnostics.maxHeight).toBeGreaterThan(first.diagnostics.minHeight + 100);
    expect(Array.from(first.heights.slice(0, 64))).toEqual(Array.from(second.heights.slice(0, 64)));
  });

  it("responds to guide OBB edits and adding/removing gullies and valleys", () => {
    const baseRecipe = createPresetRecipe("hanyan-valley", 261111);
    baseRecipe.domain.resolution = 65;
    const baseResult = generateColdSmokeMountain(baseRecipe);

    // Carve a deep gully through (-300, -100) and verify the surface lowers along the gully
    const withGully = structuredClone(baseRecipe);
    const carved = traceFallLineFeature(withGully, -260, -80, "gully", 99);
    carved.depth = 75;
    carved.width = 90;
    withGully.features.push(carved);
    const gullyResult = generateColdSmokeMountain(withGully);

    let maxDrop = 0;
    for (let i = 0; i < baseResult.heights.length; i++) {
      maxDrop = Math.max(maxDrop, baseResult.heights[i] - gullyResult.heights[i]);
    }
    expect(maxDrop).toBeGreaterThan(15);

    // Disable all guide OBBs and verify peak elevation decreases
    const withoutGuides = structuredClone(baseRecipe);
    for (const g of withoutGuides.guides) g.enabled = false;
    const noGuidesResult = generateColdSmokeMountain(withoutGuides);
    expect(noGuidesResult.diagnostics.maxHeight).toBeLessThan(baseResult.diagnostics.maxHeight);
  });

  it("evaluates 3D folded rock strata monotonically along Y", () => {
    const recipe = createPresetRecipe("twin-couloirs", 261111);
    const s0 = strataAt(180, 50, -120, recipe.strata);
    const s1 = strataAt(180, 150, -120, recipe.strata);
    expect(s1).toBeGreaterThan(s0);
  });
});
