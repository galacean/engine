import type { GLTexture2D as HostTexture } from "@galacean/engine-rhi-webgl";
import { Mixin, Overwrite } from "@/override";
import { setCompressedPixels } from "./compressedTexture";

@Mixin("GLTexture2D")
export class GLTexture2D {
  @Overwrite
  setPixelBuffer(...args: Parameters<HostTexture["setPixelBuffer"]>) {
    return setCompressedPixels(this, false, args);
  }
}
