import { GLCapabilityType } from "@galacean/engine-core";
import type { WebGLGraphicDevice } from "@galacean/engine-rhi-webgl";
import { Mixin, Overwrite } from "@/override";
import { WebGL1Extension } from "./WebGL1Extension";

@Mixin("GLCapability")
export class GLCapability {
  declare readonly rhi: WebGLGraphicDevice;

  @Overwrite
  _getColorBufferSupport(): { float: boolean; halfFloat: boolean } {
    const { rhi } = this;
    return {
      float: !!rhi.requireExtension(WebGL1Extension.colorBufferFloat),
      halfFloat: !!rhi.requireExtension(GLCapabilityType.colorBufferHalfFloat)
    };
  }

  @Overwrite
  _getMaxDrawBuffers(): number {
    const { rhi } = this;
    const extension = rhi.requireExtension(WebGL1Extension.drawBuffers);
    return extension ? rhi.gl.getParameter(extension.MAX_DRAW_BUFFERS_WEBGL) : 1;
  }

  @Overwrite
  get maxAntiAliasing(): number {
    return 1;
  }
}
