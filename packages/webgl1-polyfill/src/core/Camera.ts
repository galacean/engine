import { type Engine, GLCapabilityType, Logger, type TextureCubeFace, TextureFormat } from "@galacean/engine-core";
import { Mixin, Overwrite, Shadow, callOriginal } from "@/override";

@Mixin("Camera")
export class Camera {
  @Shadow declare _enableHDR: boolean;
  declare engine: Engine;

  @Overwrite
  set enableHDR(value: boolean) {
    if (value && !this.engine._hardwareRenderer.canIUse(GLCapabilityType.textureHalfFloat)) {
      Logger.warn("Can't enable HDR in this device.");
      return;
    }
    callOriginal(this, value);
  }
  @Overwrite
  _getInternalColorTextureFormat() {
    return this._enableHDR ? TextureFormat.R16G16B16A16 : TextureFormat.R8G8B8A8;
  }
  @Overwrite
  render(cubeFace?: TextureCubeFace, mipLevel?: number) {
    if (mipLevel !== undefined && mipLevel > 0) {
      Logger.error("mipLevel only take effect in WebGL2.0");
      mipLevel = 0;
    }
    return callOriginal(this, cubeFace, mipLevel);
  }
}
