import { Color, Vector4, type PBRMaterial } from "@galacean/engine";
import type { BuildingPaletteSlot } from "./BuildingGlobals";
import { constructionBrickLayer } from "./ConstructionPreview";
import { plasterLinearColor } from "./ConstructionPlasterPalette";
import {
  masonryAppearance,
  masonryTintRoles,
  masonryTintUniforms,
  srgbToLinear,
  type MasonryTintRole
} from "./MasonryAppearance";

/** Keep palette updates independent of the temporary geometry used to build a view. */
export function subscribeDistanceAppearance(
  appearance: ReturnType<typeof masonryAppearance>,
  material: PBRMaterial,
  source: {
    role: MasonryTintRole;
    plaster: boolean;
    decoration: boolean;
    color: readonly number[];
    owner: BuildingPaletteSlot;
  }
) {
  return appearance.subscribe(() => {
    const { role, owner } = source;
    material.baseColor = source.plaster
      ? new Color(...plasterLinearColor(source.color))
      : source.decoration
        ? new Color(1, 1, 1)
        : new Color(
            ...(appearance.previewColor(
              role,
              role === "roof_tile"
                ? owner.roofColor
                : role === "wooden_plank"
                  ? owner.woodColor
                  : constructionBrickLayer(owner.wallColor),
              source.color.map(srgbToLinear)
            ) as [number, number, number])
          );
    masonryTintRoles.forEach((role, i) =>
      material.shaderData.setVector4(masonryTintUniforms[i], new Vector4(...appearance.tint(role)))
    );
  });
}
