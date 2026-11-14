import type { Engine, Material } from "@galacean/engine";
import { buildingAssets } from "../resources/BuildingAssetKit";
import type { PrefabResource } from "@galacean/engine";
import { masonryAppearance, masonryBaseColorUniform } from "./MasonryAppearance";
import { leaseBuildingTexture, textureSourceColors } from "../resources/BuildingTextures";
import { decorationTextureBindings as bindings } from "./ConstructionBindings";
/** All owners/LODs lease the same engine texture cache; original complete mips. */
export function leaseDecorationTextures(engine: Engine, assets: PrefabResource) {
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
      bindings.map(([, name, array]) => {
        const lease = leaseBuildingTexture(engine, name, source(name), name === "timberframe");
        leases.push(lease);
        return lease.value;
      })
    );
    if (disposed) return;
    return (material: Material) => {
      bindings.forEach(([uniform], i) => material.shaderData.setTexture(uniform, textures[i]));
      const source = textureSourceColors.get(textures[0])!;
      leases.push(
        masonryAppearance(engine).subscribe(() =>
          material.shaderData.setFloatArray(
            masonryBaseColorUniform("material_WindowTimber"),
            masonryAppearance(engine).textureColors("timberframe", source, true)
          )
        )
      );
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
