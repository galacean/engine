import { Camera, Logger } from "@galacean/engine-core";
import { Mixin, Overwrite } from "@/override";

@Mixin(Camera)
export class CameraMixin {
  @Overwrite
  _resolveFramebufferMipLevel(mipLevel: number): number {
    if (mipLevel > 0) {
      Logger.error("mipLevel only take effect in WebGL2.0");
      return 0;
    }
    return mipLevel;
  }
}
