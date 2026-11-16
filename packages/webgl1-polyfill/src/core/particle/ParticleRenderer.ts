import { type Engine, GLCapabilityType, ParticleRenderer as CoreParticleRenderer } from "@galacean/engine-core";
import { Mixin, Overwrite } from "@/override";

@Mixin("ParticleRenderer", function () {
  return !this.engine._hardwareRenderer.canIUse(GLCapabilityType.instancedArrays);
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
