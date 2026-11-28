import { AssetType, Vector3, type Engine, type Material, type PBRMaterial, type Texture2D } from "@galacean/engine";
import type { RockVariantAsset } from "@galacean/engine-terrain/rock-formation/types";
import { createSurfaceMaterial } from "@galacean/engine-terrain/surface/SurfaceMaterial";
import type { RockColorBlend } from "./ColorPalette";
import { setRockColorBlend } from "./ColorMaterial";
import { rockVariantSurface } from "./Variants";

const ditherTextures = new WeakMap<Engine, Texture2D>();

/**
 * Reuses the same dither tile as the Seed vegetation materials.
 * @param engine Resource owner for the shared tile.
 */
export async function prepareRockLodDither(engine: Engine): Promise<void> {
  const cached = ditherTextures.get(engine);
  if (cached && !cached.destroyed) return;
  const url = new URL(
    "../../../../../terrain/src/data/seed-world/public/Texture/140c55bd97c21b9b.ktx2",
    import.meta.url
  ).href;
  ditherTextures.set(engine, await engine.resourceManager.load<Texture2D>({ type: AssetType.KTX2, url }));
}

/**
 * Binds the vegetation LOD dither tile after preparation.
 * @param material Surface material shared by the rock's LODs.
 */
export function bindRockLodDither(material: Material): void {
  const texture = ditherTextures.get(material.engine);
  if (!texture || texture.destroyed) return;
  material.shaderData.setTexture("material_LodDitherTexture", texture);
  material.shaderData.setFloat("material_LodDitherTextureInvSize", 1 / texture.width);
}

export function bindRockGrassGroundMaterial(material: Material, settings: { colorBlend: RockColorBlend }): void {
  material.shaderData.setVector3("material_RockColor", new Vector3(...settings.colorBlend.color));
}

/** Creates a surface using the asset UVs and the live terrain color on upper faces. */
export function createRockVariantMaterial(engine: Engine, asset: RockVariantAsset, tint: RockColorBlend): PBRMaterial {
  const material = createSurfaceMaterial(engine, { ...rockVariantSurface(asset), normalInBaseRegionOnly: true });
  bindRockLodDither(material);
  setRockColorBlend(material, tint);
  return material;
}
