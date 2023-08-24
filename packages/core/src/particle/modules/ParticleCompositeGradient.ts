import { Color } from "@galacean/engine-math";
import { deepClone } from "../../clone/CloneManager";
import { ParticleGradientMode } from "../enums/ParticleGradientMode";
import { ParticleGradient } from "./ParticleGradient";

/**
 * Particle composite gradient.
 */
export class ParticleCompositeGradient {
  /** The gradient mode. */
  mode: ParticleGradientMode = ParticleGradientMode.Constant;
  /* The min constant color used by the gradient if mode is set to `TwoConstants`. */
  @deepClone
  constantMin: Color = new Color();
  /* The max constant color used by the gradient if mode is set to `TwoConstants`. */
  @deepClone
  constantMax: Color = new Color();
  /** The min gradient used by the gradient if mode is set to `Gradient`. */
  @deepClone
  gradientMin: ParticleGradient = new ParticleGradient();
  /** The max gradient used by the gradient if mode is set to `Gradient`. */
  @deepClone
  gradientMax: ParticleGradient = new ParticleGradient();

  /**
   *  The constant color used by the gradient if mode is set to `Constant`.
   */
  get constant(): Color {
    return this.constantMax;
  }

  set constant(value: Color) {
    this.constantMax = value;
  }

  /**
   * The gradient used by the gradient if mode is set to `Gradient`.
   */
  get gradient(): ParticleGradient {
    return this.gradientMax;
  }

  set gradient(value: ParticleGradient) {
    this.gradientMax = value;
  }

  /**
   * Create a particle gradient that generates a constant color.
   * @param constant - The constant color
   */
  constructor(constant: Color);

  /**
   * Create a particle gradient that can generate color between a minimum constant and a maximum constant.
   * @param constantMin - The min constant color
   * @param constantMax - The max constant color
   */
  constructor(constantMin: Color, constantMax: Color);

  /**
   * Create a particle gradient that generates a color from a gradient.
   * @param gradient - The gradient
   */
  constructor(gradient: ParticleGradient);

  /**
   * Create a particle gradient that can generate color from a minimum gradient and a maximum gradient.
   * @param gradientMin - The min gradient
   *
   */
  constructor(gradientMin: ParticleGradient, gradientMax: ParticleGradient);

  constructor(constantOrGradient: Color | ParticleGradient, constantMaxOrGradientMax?: Color | ParticleGradient) {
    if (constantOrGradient.constructor === Color) {
      if (constantMaxOrGradientMax) {
        this.constantMin.copyFrom(<Color>constantOrGradient);
        this.constantMax.copyFrom(<Color>constantMaxOrGradientMax);
        this.mode = ParticleGradientMode.TwoConstants;
      } else {
        this.constant.copyFrom(<Color>constantOrGradient);
        this.mode = ParticleGradientMode.Constant;
      }
    } else {
      if (constantMaxOrGradientMax) {
        this.gradientMin = <ParticleGradient>constantOrGradient;
        this.gradientMax = <ParticleGradient>constantMaxOrGradientMax;
        this.mode = ParticleGradientMode.TwoGradients;
      } else {
        this.gradient = <ParticleGradient>constantOrGradient;
        this.mode = ParticleGradientMode.Gradient;
      }
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
}
