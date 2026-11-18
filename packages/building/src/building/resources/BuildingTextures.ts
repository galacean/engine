import { Texture2D, Texture2DArray, type Engine } from "@galacean/engine";
import { retainBuildingResource, type BuildingTexture } from "./BuildingAssetKit";
import { masonryAppearance } from "../runtime/MasonryAppearance";
export const textureSourceColors = new WeakMap<BuildingTexture, Float32Array>();
/** Borrow the native Texture. The asset loader owns upload, mip layout and restoration. */
export function leaseBuildingTexture(
  engine: Engine,
  name: string,
  source: { texture: BuildingTexture; neutral?: BuildingTexture; colors?: Float32Array },
  neutral = false
) {
  if (!source) throw Error("Missing building Texture: " + name);
  const texture = neutral && source.neutral ? source.neutral : source.texture;
  if (!(texture instanceof Texture2D || texture instanceof Texture2DArray) || texture.destroyed)
    throw Error("Invalid native building Texture: " + name);
  if (neutral && source.neutral) {
    if (!source.colors) throw Error("Missing material source palette: " + name);
    textureSourceColors.set(texture, source.colors);
    masonryAppearance(engine).registerSourceColors(name, source.colors);
  }
  retainBuildingResource(texture, 1);
  let released = false;
  return {
    value: Promise.resolve(texture),
    destroy() {
      if (!released) {
        released = true;
        retainBuildingResource(texture, -1);
      }
    }
  };
}
