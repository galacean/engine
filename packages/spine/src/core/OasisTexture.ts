import { Texture2D } from "@alipay/o3-material";
import { spine } from "@alipay/spine-core";

export class OasisTextrure extends spine.Texture {
  texture: Texture2D;

  constructor(rhi, image: HTMLImageElement) {
    super(image);
    this.texture = new Texture2D(rhi, image.width, image.height);
    this.texture.setImageSource(image);
  }

  dispose() {}
}
