import { Logger } from "@galacean/engine-core";
import { Mixin, Overwrite } from "@/override";
import { WebGL1CapabilityType, type WebGL1GraphicDevice } from "../../rhi-webgl/GLCapability";
import { WebGL1Extension } from "../../rhi-webgl/WebGL1Extension";

@Mixin("SkinnedMeshRenderer", function () {
  const device = this.engine._hardwareRenderer as WebGL1GraphicDevice;
  return !device.canIUse(WebGL1Extension.textureFloat) || !device.canIUse(WebGL1CapabilityType.vertexTextureSampling);
})
export class SkinnedMeshRenderer {
  @Overwrite
  _configureJointTexture(boneCount: number): void {
    Logger.error(
      `This device does not support joint textures. The mesh's ${boneCount} joints exceed the available joint uniform capacity.`,
      this
    );
  }
}
