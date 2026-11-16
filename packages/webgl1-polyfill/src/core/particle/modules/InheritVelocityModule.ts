import { ParticleInheritVelocityMode } from "@galacean/engine-core";
import { Mixin, Overwrite, callOriginal } from "@/override";

@Mixin("InheritVelocityModule")
export class InheritVelocityModule {
  declare mode: ParticleInheritVelocityMode;
  declare _resyncEmitterVelocity: () => void;
  @Overwrite
  _needTransformFeedback() {
    return false;
  }
  @Overwrite
  _updateEmitterVelocity(elapsedTime: number) {
    if (this.mode !== ParticleInheritVelocityMode.Initial) {
      this._resyncEmitterVelocity();
      return;
    }
    callOriginal(this, elapsedTime);
  }
}
