import { IClone } from "@galacean/engine-design";

import { ParticleCompositeCurve } from "./ParticleCompositeCurve";
import { ParticleGeneratorModule } from "./ParticleGeneratorModule";

/**
 * Rotate particles throughout their lifetime.
 */
export class SizeOverLifetimeModule extends ParticleGeneratorModule {
  /** Specifies whether the rotation is separate on each axis, when disabled only x axis is used and applied to all axes. */
  separateAxes: boolean = false;

  /** Rotation over lifetime for z axis. */
  x: ParticleCompositeCurve = new ParticleCompositeCurve(0);
  /** Rotation over lifetime for z axis. */
  y: ParticleCompositeCurve = new ParticleCompositeCurve(0);
  /** Rotation over lifetime for z axis. */
  z: ParticleCompositeCurve = new ParticleCompositeCurve(0);

  /**
   * @override
   * @inheritDoc
   */
  cloneTo(destRotationOverLifetime: SizeOverLifetimeModule): void {}
}
