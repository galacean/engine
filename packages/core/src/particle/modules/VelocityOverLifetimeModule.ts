import { IClone } from "@galacean/engine-design";

import { ParticleCurve } from "./ParticleCurve";
import { ParticleGeneratorModule } from "./ParticleGeneratorModule";

/**
 * Rotate particles throughout their lifetime.
 */
export class VelocityOverLifetimeModule extends ParticleGeneratorModule {
  /** Specifies whether the rotation is separate on each axis, when disabled only z axis is used. */
  separateAxes: boolean = false;

  /** Rotation over lifetime for z axis. */
  x: ParticleCurve = new ParticleCurve(0);
  /** Rotation over lifetime for z axis. */
  y: ParticleCurve = new ParticleCurve(0);
  /** Rotation over lifetime for z axis. */
  z: ParticleCurve = new ParticleCurve(45);

  /**
   * @override
   * @inheritDoc
   */
  cloneTo(destRotationOverLifetime: VelocityOverLifetimeModule): void {}
}
