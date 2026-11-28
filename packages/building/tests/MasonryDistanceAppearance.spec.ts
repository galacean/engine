import { describe, expect, it, vi } from "vitest";
import { Color, Vector4, type PBRMaterial } from "@galacean/engine";
import {
  masonryAppearance,
  masonryTintRoles,
  masonryTintUniforms,
  srgbToLinear
} from "../src/building/runtime/MasonryAppearance";
import { subscribeDistanceAppearance } from "../src/building/runtime/MasonryDistanceAppearance";
import { plasterLinearColor } from "../src/building/runtime/ConstructionPlasterPalette";
import { constructionBrickLayer } from "../src/building/runtime/ConstructionPreview";

describe("distance material palette subscriptions", () => {
  it.each(masonryTintRoles)("updates %s colors and releases the listener on destruction", (role) => {
    const appearance = masonryAppearance({});
    const material = { baseColor: new Color(), shaderData: { setVector4: vi.fn() } } as unknown as PBRMaterial;
    const owner = { seed: 1, wallColor: 2, roofColor: 1, woodColor: 3 };
    const color = [0.2, 0.4, 0.6];
    const subscription = subscribeDistanceAppearance(appearance, material, {
      role,
      plaster: false,
      decoration: false,
      color,
      owner
    });
    expect(material.baseColor).toEqual(new Color(...(color.map(srgbToLinear) as [number, number, number])));
    appearance.setColor(role, "#804020");
    expect(material.baseColor).toEqual(new Color(...appearance.linearColor(role)));
    masonryTintRoles.forEach((tintRole, i) =>
      expect(material.shaderData.setVector4).toHaveBeenCalledWith(
        masonryTintUniforms[i],
        new Vector4(...appearance.tint(tintRole))
      )
    );
    appearance.reset();
    expect(material.baseColor).toEqual(new Color(...(color.map(srgbToLinear) as [number, number, number])));
    const preview = vi.spyOn(appearance, "previewColor");
    owner.wallColor = 4;
    owner.roofColor = 5;
    owner.woodColor = 6;
    appearance.setSeed(2);
    expect(preview).toHaveBeenLastCalledWith(
      role,
      role === "roof_tile" ? 5 : role === "wooden_plank" ? 6 : constructionBrickLayer(4),
      color.map(srgbToLinear)
    );
    const previous = material.baseColor;
    subscription.destroy();
    appearance.setColor(role, "#ffffff");
    expect(material.baseColor).toBe(previous);
  });

  it.each([true, false])("keeps plaster=%s base colors independent of palette overrides", (plaster) => {
    const appearance = masonryAppearance({});
    const material = { baseColor: new Color(), shaderData: { setVector4: vi.fn() } } as unknown as PBRMaterial;
    const color = [0.3, 0.4, 0.5];
    const subscription = subscribeDistanceAppearance(appearance, material, {
      role: "brick",
      plaster,
      decoration: true,
      color,
      owner: { seed: 0, wallColor: 0, roofColor: 0, woodColor: 0 }
    });
    const expected = plaster ? new Color(...plasterLinearColor(color)) : new Color(1, 1, 1);
    expect(material.baseColor).toEqual(expected);
    appearance.setColor("brick", "#112233");
    expect(material.baseColor).toEqual(expected);
    subscription.destroy();
  });
});
