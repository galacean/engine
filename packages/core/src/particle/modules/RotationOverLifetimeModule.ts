import { IClone } from "@galacean/engine-design";

import { ParticleCompositeCurve } from "./ParticleCompositeCurve";
import { ParticleGeneratorModule } from "./ParticleGeneratorModule";

/**
 * Rotate particles throughout their lifetime.
 */
export class RotationOverLifetimeModule extends ParticleGeneratorModule {
  /** Specifies whether the rotation is separate on each axis, when disabled only z axis is used. */
  separateAxes: boolean = false;

  /** Rotation over lifetime for z axis. */
  x: ParticleCompositeCurve = new ParticleCompositeCurve(0);
  /** Rotation over lifetime for z axis. */
  y: ParticleCompositeCurve = new ParticleCompositeCurve(0);
  /** Rotation over lifetime for z axis. */
  z: ParticleCompositeCurve = new ParticleCompositeCurve(45);

  /**
   * @override
   * @inheritDoc
   */
  cloneTo(destRotationOverLifetime: RotationOverLifetimeModule): void {}
}
