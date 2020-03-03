import { Texture2D } from "@alipay/o3-material";
import { TextureFilter, TextureWrapMode } from "@alipay/o3-base";
import { spine } from "@alipay/spine-core";

export class OasisTextrure extends spine.Texture {
  texture: Texture2D;

  constructor(image: HTMLImageElement) {
    super(image);
    this.texture = new Texture2D("SPINE_TEXTURE", image);
  }

  setFilters(minFilter: TextureFilter, magFilter: TextureFilter) {
    this.texture.setFilter(minFilter, magFilter);
  }
  setWraps(uWrap: TextureWrapMode, vWrap: TextureWrapMode) {
    this.texture.setWrapMode(uWrap, vWrap);
  }

  dispose() {}
}
