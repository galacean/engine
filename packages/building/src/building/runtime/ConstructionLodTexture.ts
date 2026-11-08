import { Texture2D, TextureFormat, TextureFilterMode, TextureWrapMode, type Engine } from "@galacean/engine";
import { restoreResource } from "@galacean/engine-modify/rendering/RestorableResources";
import type { ConstructionLodAppearance } from "./ConstructionLodAppearance";
/** View-owned derived texture; retained bytes also restore a lost GL context. */
export function createConstructionLodTexture(engine: Engine, appearance: ConstructionLodAppearance) {
  const texture = new Texture2D(engine, appearance.width, appearance.height, TextureFormat.R8G8, true);
  try {
    const upload = () => {
      texture.setPixelBuffer(appearance.pixels);
      texture.generateMipmaps();
    };
    upload();
    texture.filterMode = TextureFilterMode.Trilinear;
    texture.wrapModeU = texture.wrapModeV = TextureWrapMode.Clamp;
    return restoreResource(texture, upload);
  } catch (error) {
    texture.destroy();
    throw error;
  }
}
