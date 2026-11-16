import { type Engine, GLCapabilityType, TextureFormat } from "@galacean/engine-core";
import { Mixin, Overwrite, callOriginal } from "@/override";

@Mixin("SystemInfo")
export class SystemInfo {
  @Overwrite
  static supportsTextureFormat(engine: Engine, format: TextureFormat) {
    const rhi = engine._hardwareRenderer;
    switch (format) {
      case TextureFormat.R11G11B10_UFloat:
      case TextureFormat.R32G32B32A32_UInt:
      case TextureFormat.Depth24:
      case TextureFormat.Depth32:
      case TextureFormat.Depth32Stencil8:
      case TextureFormat.R8:
      case TextureFormat.R8G8:
        return false;
      case TextureFormat.R16G16B16A16:
        if (!rhi.canIUse(GLCapabilityType.textureHalfFloat)) return false;
        break;
      case TextureFormat.R32G32B32A32:
        if (!rhi.canIUse(GLCapabilityType.textureFloat)) return false;
        break;
      case TextureFormat.Depth16:
      case TextureFormat.Depth24Stencil8:
      case TextureFormat.Depth:
      case TextureFormat.DepthStencil:
        if (!rhi.canIUse(GLCapabilityType.depthTexture)) return false;
        break;
    }
    return callOriginal(this, engine, format);
  }
}
