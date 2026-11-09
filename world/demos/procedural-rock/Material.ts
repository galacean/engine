import { Color, Vector3, type Engine, type PBRMaterial } from "@galacean/engine";
import { createRockFormationMaterial, prepareRockTextures, setRockTextureScale } from "./RockMaterial";
import { bindSeedWorldGrassColorField } from "@galacean/engine-vegetation/world/SeedWorldGrassColorFieldUniforms";
import type { SeedWorldGrassColorFieldBinding } from "@galacean/engine-vegetation/world/SeedWorldGrassColorField";

export const DEFAULT_WORLD_ROCK_COLOR = "#b8bcc2";

/** Atomic previews use the same shader and shared texture pair as the published Seed world. */
export async function createWorldRockMaterials(engine: Engine, field: SeedWorldGrassColorFieldBinding) {
  await prepareRockTextures(engine, new AbortController().signal);
  const owned = new Set<PBRMaterial>(),
    tint = new Vector3();
  let slope = 35;
  function setColor(hex: string) {
    if (!/^#[0-9a-f]{6}$/i.test(hex)) return;
    const rgb = Number.parseInt(hex.slice(1), 16);
    tint.set(
      Color.sRGBToLinearSpace((rgb >>> 16) / 255),
      Color.sRGBToLinearSpace(((rgb >>> 8) & 255) / 255),
      Color.sRGBToLinearSpace((rgb & 255) / 255)
    );
    for (const material of owned) material.shaderData.setVector3("material_RockColor", tint);
  }
  setColor(DEFAULT_WORLD_ROCK_COLOR);
  return {
    create(tileSize: number) {
      const material = createRockFormationMaterial(engine, tileSize, { color: [tint.x, tint.y, tint.z] });
      material.shaderData.setFloat("material_WorldGrassCoverageFromMesh", 0);
      material.shaderData.setFloat("material_WorldGrassSlope", Math.cos((slope * Math.PI) / 180));
      material.shaderData.enableMacro("MATERIAL_GRASS_SHARED_COLOR_FIELD");
      bindSeedWorldGrassColorField(material.shaderData, "material", field);
      owned.add(material);
      return material;
    },
    setColor,
    setTileSize(material: PBRMaterial, metres: number) {
      setRockTextureScale(material, Math.max(0.01, metres));
    },
    setGrassSlope(degrees: number) {
      slope = degrees;
      for (const material of owned)
        material.shaderData.setFloat("material_WorldGrassSlope", Math.cos((degrees * Math.PI) / 180));
    },
    dispose() {
      for (const material of owned) material.destroy();
      owned.clear();
    }
  };
}
