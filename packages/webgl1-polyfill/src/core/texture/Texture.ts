import { Texture, Logger, type TextureDepthCompareFunction } from "@galacean/engine-core";
import { Mixin, Overwrite } from "@/override";

@Mixin(Texture)
export class TextureMixin {
  @Overwrite
  set depthCompareFunction(_value: TextureDepthCompareFunction) {
    Logger.warn("depthCompareFunction only support WebGL2");
  }
}
