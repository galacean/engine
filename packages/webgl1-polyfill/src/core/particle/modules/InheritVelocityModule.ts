import {
  InheritVelocityModule,
  ParticleInheritVelocityMode,
  ParticleSimulationSpace,
  type ParticleGenerator
} from "@galacean/engine-core";
import { Mixin, Overwrite, Shadow } from "@/override";

@Mixin(InheritVelocityModule)
export class InheritVelocityModuleMixin {
  @Shadow declare _generator: ParticleGenerator;
  @Shadow declare _mode: ParticleInheritVelocityMode;

  @Overwrite
  _shouldTrackEmitterVelocity(): boolean {
    return (
      this._mode === ParticleInheritVelocityMode.Initial &&
      this._generator.main.simulationSpace === ParticleSimulationSpace.World
    );
  }

  @Overwrite
  _needTransformFeedback(): boolean {
    return false;
  }
}
