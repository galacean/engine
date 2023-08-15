import { IClone } from "@galacean/engine-design";
import { Color } from "@galacean/engine-math";
import { ParticleGradientMode } from "../enums/ParticleGradientMode";

/**
 * Particle Gradient.
 */
export class ParticleGradient implements IClone {
  /** The gradient mode. */
  mode: ParticleGradientMode = ParticleGradientMode.Constant;
  /* The constant color used by the gradient if mode is set to `Constant`. */
  constant: Color = new Color();
  /* The min constant color value used by the gradient if mode is set to `TwoConstants`. */
  constantMin: Color = new Color();
  /* The max constant color value used by the gradient if mode is set to `TwoConstants`. */
  constantMax: Color = new Color();

  /**
   * Create a particle gradient that generates a constant color.
   * @param constant - The constant color
   */
  constructor(constant: Color);

  /**
   * Create a particle gradient that can generate color between a minimum constant and a maximum constant.
   * @param constantMin - The min constant value
   * @param constantMax - The max constant value
   */
  constructor(constantMin: Color, constantMax: Color);

  constructor(constantOrConstantMin: Color, constantMax?: Color) {
    if (constantMax) {
      this.constantMin.copyFrom(constantOrConstantMin);
      this.constantMax.copyFrom(constantMax);
      this.mode = ParticleGradientMode.TwoConstants;
    } else {
      this.constant.copyFrom(constantOrConstantMin);
      this.mode = ParticleGradientMode.Constant;
    }
  }

  /**
   * Query the color at the specified time.
   * @param time - Normalized time at which to evaluate the gradient, Valid when `mode` is set to `Gradient` or `TwoGradients`
   * @param lerpFactor - Lerp factor between two constants or gradients, Valid when `mode` is set to `TwoConstants` or `TwoGradients`
   * @param out - The result color
   */

  evaluate(time: number, lerpFactor: number, out: Color): void {
    switch (this.mode) {
      case ParticleGradientMode.Constant:
        out.copyFrom(this.constant);
        break;
      case ParticleGradientMode.TwoConstants:
        Color.lerp(this.constantMin, this.constantMax, lerpFactor, out);
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
    destEmission.constant.copyFrom(this.constant);
    destEmission.constantMin.copyFrom(this.constantMin);
    destEmission.constantMax.copyFrom(this.constantMax);
  }

  /**
   * @inheritDoc
   */
  clone(): ParticleGradient {
    const destGradient = new ParticleGradient(this.constant);
    this.cloneTo(destGradient);
    return destGradient;
  }
}
