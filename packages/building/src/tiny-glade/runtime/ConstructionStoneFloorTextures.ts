import type { Engine, Material } from "@galacean/engine";
import { buildingAssets } from "../resources/BuildingAssetKit";
import type { PrefabResource } from "@galacean/engine";
import { masonryAppearance, masonryBaseColorUniform } from "./MasonryAppearance";
import { leaseBuildingTexture, textureSourceColors } from "../resources/BuildingTextures";
import { stoneFloorTextureBindings } from "./ConstructionStoneFloorAssets";
export function leaseStoneFloorTextures(engine: Engine, assets: PrefabResource, whiteBase = false) {
  let disposed = false;
  const leases: Array<{ destroy(): void }> = [];
  const ready = Promise.resolve().then(async () => {
    if (disposed) return;
    const kit = buildingAssets(assets);
    const source = (name: string) => ({
      texture: kit.textures[name],
      neutral: kit.neutralTextures[name],
      colors: kit.textureColors[name]
    });
    if (disposed) return;
    const textures = await Promise.all(
      stoneFloorTextureBindings.map(([, name, array]) => {
        const lease = leaseBuildingTexture(engine, name, source(name), whiteBase && name === "brick_colors");
        leases.push(lease);
        return lease.value;
      })
    );
    if (disposed) return;
    return (material: Material) => {
      stoneFloorTextureBindings.forEach(([name], i) => {
        material.shaderData.setTexture(name, textures[i]);
        const source = textureSourceColors.get(textures[i]);
        if (source)
          leases.push(
            masonryAppearance(engine).subscribe(() =>
              material.shaderData.setFloatArray(
                masonryBaseColorUniform(name),
                masonryAppearance(engine).textureColors("brick_colors", source, true)
              )
            )
          );
      });
    };
  });
  return {
    ready,
    destroy() {
      if (disposed) return;
      disposed = true;
      for (const lease of leases) lease.destroy();
    }
  };
}
