import { Texture2D } from "@alipay/o3-material";
import { spine } from "@alipay/spine-core";
import { TextureWrapMode, TextureFilterMode, TextureFilter } from "@alipay/o3-base";

export class OasisTextrure extends spine.Texture {
  texture: Texture2D;

  constructor(image: HTMLImageElement) {
    super(image);
    this.texture = new Texture2D(image.width, image.height);
    this.texture.setImageSource(image);
  }

  setFilters(minFilter: TextureFilter, magFilter: TextureFilter) {
    if (minFilter === TextureFilter.NEAREST) {
      this.texture.filterMode = TextureFilterMode.Point;
    } else if (magFilter === TextureFilter.LINEAR_MIPMAP_LINEAR) {
      this.texture.filterMode = TextureFilterMode.Trilinear;
    } else {
      this.texture.filterMode = TextureFilterMode.Bilinear;
    }
  }
  setWraps(uWrap: TextureWrapMode, vWrap: TextureWrapMode) {
    this.texture.wrapModeU = uWrap;
    this.texture.wrapModeV = vWrap;
  }

  dispose() {}
}
