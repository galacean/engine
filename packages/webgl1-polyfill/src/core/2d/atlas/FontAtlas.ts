import { type Engine, Texture2D, TextureFilterMode, TextureFormat } from "@galacean/engine-core";
import { Mixin, Overwrite } from "@/override";

@Mixin("FontAtlas")
export class FontAtlas {
  @Overwrite
  _createTexture(engine: Engine) {
    const texture = new Texture2D(engine, 512, 512, TextureFormat.Alpha8, false, false);
    texture.filterMode = TextureFilterMode.Bilinear;
    texture.isGCIgnored = true;
    return texture;
  }
}
