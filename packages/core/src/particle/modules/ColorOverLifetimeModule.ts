import { IClone } from "@galacean/engine-design";

import { ParticleCompositeCurve } from "./ParticleCompositeCurve";
import { ParticleGeneratorModule } from "./ParticleGeneratorModule";
import { ParticleGradient } from "./ParticleGradient";
import { Color } from "@galacean/engine-math";

/**
 * Rotate particles throughout their lifetime.
 */
export class ColorOverLifetimeModule extends ParticleGeneratorModule {
  /** Specifies whether the rotation is separate on each axis, when disabled only x axis is used and applied to all axes. */
  separateAxes: boolean = false;

  /** Rotation over lifetime for z axis. */
  color: ParticleGradient = new ParticleGradient(new Color(1, 1, 1, 1));

  /**
   * @override
   * @inheritDoc
   */
  cloneTo(destRotationOverLifetime: ColorOverLifetimeModule): void {}
}
