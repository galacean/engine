import { IClone } from "@galacean/engine-design";
import { ParticleGradientMode } from "../enums/ParticleGradientMode";

/**
 * Particle curve.
 */
export class ParticleGradient implements IClone {
  /** The curve mode. */
  mode: ParticleGradientMode = ParticleGradientMode.Color;
  /* The constant value used by the curve if mode is set to `Constant`. */
  color: number = 0;
  /* The min constant value used by the curve if mode is set to `TwoConstants`. */
  colorMin: number = 0;
  /* The max constant value used by the curve if mode is set to`TwoConstants`. */
  colorMax: number = 0;

  /**
   * @inheritDoc
   */
  cloneTo(destEmission: ParticleGradient): void {
    destEmission.mode = this.mode;
    destEmission.color = this.color;
    destEmission.colorMin = this.colorMin;
    destEmission.colorMax = this.colorMax;
  }

  /**
   * @inheritDoc
   */
  clone(): ParticleGradient {
    const destEmission = new ParticleGradient();
    this.cloneTo(destEmission);
    return destEmission;
  }
}
