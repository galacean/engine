import type { Engine, Material } from "@galacean/engine";
import { buildingAssets } from "../resources/BuildingAssetKit";
import type { PrefabResource } from "@galacean/engine";
import { masonryAppearance, masonryBaseColorUniform } from "./MasonryAppearance";
import { leaseBuildingTexture, textureSourceColors } from "../resources/BuildingTextures";
import { plasterTextureBindings } from "./ConstructionBindings";
/** Lease immediately, publish only after both complete mip chains are ready. */
export function leasePlasterTextures(engine: Engine, assets: PrefabResource) {
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
      plasterTextureBindings.map(([, name]) => {
        const lease = leaseBuildingTexture(engine, name, source(name), true);
        leases.push(lease);
        return lease.value;
      })
    );
    if (disposed) return;
    return (material: Material) => {
      plasterTextureBindings.forEach(([uniform], i) => material.shaderData.setTexture(uniform, textures[i]));
      for (const [i, [uniform, name]] of plasterTextureBindings.entries()) {
        const source = textureSourceColors.get(textures[i])!;
        leases.push(
          masonryAppearance(engine).subscribe(() =>
            material.shaderData.setFloatArray(
              masonryBaseColorUniform(uniform),
              masonryAppearance(engine).textureColors(name, source)
            )
          )
        );
      }
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
