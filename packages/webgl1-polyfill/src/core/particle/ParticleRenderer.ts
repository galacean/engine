import { type Engine, ParticleRenderer as CoreParticleRenderer } from "@galacean/engine-core";
import { Mixin, Overwrite } from "@/override";
import type { WebGL1GraphicDevice } from "../../rhi-webgl/GLCapability";
import { WebGL1Extension } from "../../rhi-webgl/WebGL1Extension";

@Mixin("ParticleRenderer", function () {
  return !(this.engine._hardwareRenderer as WebGL1GraphicDevice).canIUse(WebGL1Extension.instancedArrays);
})
export class ParticleRenderer {
  declare engine: Engine;
  @Overwrite
  _prepareRender() {}
  @Overwrite
  _onEnableInScene() {
    const particle = CoreParticleRenderer.prototype;
    Object.getPrototypeOf(particle)._onEnableInScene.call(this);
  }
}
