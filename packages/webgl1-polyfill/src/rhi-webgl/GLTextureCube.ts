import type { GLTextureCube as HostTexture } from "@galacean/engine-rhi-webgl";
import { Mixin, Overwrite } from "@/override";
import { setCompressedPixels } from "./compressedTexture";

@Mixin("GLTextureCube")
export class GLTextureCube {
  @Overwrite
  setPixelBuffer(...args: Parameters<HostTexture["setPixelBuffer"]>) {
    return setCompressedPixels(this, true, args);
  }
}
