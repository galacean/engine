import { IClone } from "@galacean/engine-design";
import { ParticleGradientMode } from "../enums/ParticleGradientMode";
import { Color } from "@galacean/engine-math";

/**
 * Particle curve.
 */
export class ParticleGradient implements IClone {
  /** The curve mode. */
  mode: ParticleGradientMode = ParticleGradientMode.Color;
  /* The constant value used by the curve if mode is set to `Constant`. */
  color: Color = new Color();
  /* The min constant value used by the curve if mode is set to `TwoConstants`. */
  colorMin: Color = new Color();
  /* The max constant value used by the curve if mode is set to`TwoConstants`. */
  colorMax: Color = new Color();

  /**
   * Query the color at the specified time.
   * @param time - Normalized time at which to evaluate the curve, Valid when `mode` is set to `Gradient` or `TwoGradients`
   * @param lerpFactor - Lerp factor between two color or gradient, Valid when `mode` is set to `TwoColors` or `TwoGradients`
   * @param out - The result color
   */

  evaluate(time: number, lerpFactor: number, out: Color): void {
    switch (this.mode) {
      case ParticleGradientMode.Color:
        out.copyFrom(this.color);
        break;
      case ParticleGradientMode.TwoColors:
        Color.lerp(this.colorMin, this.colorMax, lerpFactor, out);
        break;
      default:
        break;
    }
  }

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
