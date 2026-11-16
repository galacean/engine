import type { Engine } from "@galacean/engine-core";
import { Mixin, Overwrite } from "@/override";
import { WebGL1CapabilityType, type WebGL1GraphicDevice } from "../../../rhi-webgl/GLCapability";
import { WebGL1Extension } from "../../../rhi-webgl/WebGL1Extension";

export function supportsAmbientOcclusion(engine: Engine): boolean {
  const device = engine._hardwareRenderer as WebGL1GraphicDevice;
  return device.canIUse(WebGL1CapabilityType.fragmentHighPrecision) && device.canIUse(WebGL1Extension.depthTexture);
}

@Mixin("AmbientOcclusion", function () {
  return !supportsAmbientOcclusion(this._scene.engine);
})
export class AmbientOcclusion {
  @Overwrite
  _isValid(): boolean {
    return false;
  }
}
