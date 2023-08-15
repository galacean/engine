import { IClone } from "@galacean/engine-design";

import { ParticleCurve } from "./ParticleCurve";
import { ParticleGeneratorModule } from "./ParticleGeneratorModule";

/**
 * Rotate particles throughout their lifetime.
 */
export class SizeOverLifetimeModule extends ParticleGeneratorModule {
  /** Specifies whether the rotation is separate on each axis, when disabled only x axis is used and applied to all axes. */
  separateAxes: boolean = false;

  /** Rotation over lifetime for z axis. */
  x: ParticleCurve = new ParticleCurve(0);
  /** Rotation over lifetime for z axis. */
  y: ParticleCurve = new ParticleCurve(0);
  /** Rotation over lifetime for z axis. */
  z: ParticleCurve = new ParticleCurve(0);

  /**
   * @override
   * @inheritDoc
   */
  cloneTo(destRotationOverLifetime: SizeOverLifetimeModule): void {}
}
