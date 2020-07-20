import { Texture2D } from "@alipay/o3-material";
import { spine } from "@alipay/spine-core";

export class OasisTextrure extends spine.Texture {
  texture: Texture2D;

  constructor(image: HTMLImageElement) {
    super(image);
    this.texture = new Texture2D(image.width, image.height);
    this.texture.setImageSource(image);
  }

  dispose() {}
}
