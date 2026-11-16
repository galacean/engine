import { TextureFormat } from "@galacean/engine-core";
import { Mixin, Overwrite } from "@/override";
import type { WebGL1GraphicDevice } from "../../rhi-webgl/GLCapability";
import { WebGL1Extension } from "../../rhi-webgl/WebGL1Extension";
import { supportsAmbientOcclusion } from "../lighting/ambientOcclusion/AmbientOcclusion";

@Mixin("BasicRenderPipeline")
export class BasicRenderPipeline {
  /** @internal */
  @Overwrite
  _getDefaultDepthOnlyFormat(): TextureFormat {
    return TextureFormat.Depth16;
  }

  /** @internal */
  @Overwrite
  _needsBackgroundColorCopy(): boolean {
    return true;
  }
}

@Mixin("BasicRenderPipeline", function () {
  const device = this._camera.engine._hardwareRenderer as WebGL1GraphicDevice;
  return !device.canIUse(WebGL1Extension.depthTexture);
})
class DepthPrepass {
  @Overwrite
  _createDepthOnlyPass(): null {
    return null;
  }
}

@Mixin("BasicRenderPipeline", function () {
  return !supportsAmbientOcclusion(this._camera.engine);
})
class AmbientOcclusionPass {
  @Overwrite
  _createAmbientOcclusionPass(): null {
    return null;
  }
}
