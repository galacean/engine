import { Vector3, type Engine, type Material, type PBRMaterial } from "@galacean/engine";
import type { RockVariantAsset } from "@galacean/engine-terrain/rock-formation/types";
import { createSurfaceMaterial } from "@galacean/engine-terrain/surface/SurfaceMaterial";
import type { RockColorBlend } from "./ColorPalette";
import { setRockColorBlend } from "./ColorMaterial";
import { rockVariantSurface } from "./Variants";

export function bindRockGrassGroundMaterial(material: Material, settings: { colorBlend: RockColorBlend }): void {
  material.shaderData.setVector3("material_RockColor", new Vector3(...settings.colorBlend.color));
}

/** Creates a surface using the asset UVs and the live terrain color on upper faces. */
export function createRockVariantMaterial(engine: Engine, asset: RockVariantAsset, tint: RockColorBlend): PBRMaterial {
  const material = createSurfaceMaterial(engine, { ...rockVariantSurface(asset), normalInBaseRegionOnly: true });
  setRockColorBlend(material, tint);
  return material;
}
