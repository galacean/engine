import { Camera, TextureFormat } from "@galacean/engine-core";
import { Mixin, Overwrite } from "@/override";

@Mixin(Camera)
export class CameraMixin {
  @Overwrite
  _getHDRColorTextureFormat(): TextureFormat {
    return TextureFormat.R16G16B16A16;
  }
}
