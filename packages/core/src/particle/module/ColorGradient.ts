import { IClone } from "@oasis-engine/design";
import { Color } from "@oasis-engine/math";
import { ParticleGradientMode } from "../enum/ParticleGradientMode";
import { Gradient } from "./Gradient";

/**
 *  The Color Gradient.
 */
export class ColorGradient implements IClone {
  /**
   * A single constant color for the entire gradient.
   * @param constant - Constant color.
   */
  static createByColor(constant: Color): ColorGradient {
    const gradientColor: ColorGradient = new ColorGradient();
    gradientColor._mode = ParticleGradientMode.Color;
    gradientColor._color = constant;
    return gradientColor;
  }

  /**
   * Use one gradient when evaluating numbers along this Min-Max Gradient.
   * @param gradient - A single gradient for evaluating against.
   */
  static createByGradient(gradient: Gradient): ColorGradient {
    const gradientColor: ColorGradient = new ColorGradient();
    gradientColor._mode = ParticleGradientMode.Gradient;
    gradientColor._gradient = gradient;
    return gradientColor;
  }

  /**
   * Randomly select colors based on the interval between the minimum and maximum constants.
   * @param minConstant - The constant color describing the minimum colors to be evaluated.
   * @param maxConstant - The constant color describing the maximum colors to be evaluated.
   */
  static createByRandomTwoColor(minConstant: Color, maxConstant: Color): ColorGradient {
    const gradientColor: ColorGradient = new ColorGradient();
    gradientColor._mode = ParticleGradientMode.TwoColors;
    gradientColor._colorMin = minConstant;
    gradientColor._colorMax = maxConstant;
    return gradientColor;
  }

  /**
   * Randomly select colors based on the interval between the minimum and maximum gradients.
   * @param minGradient - The gradient describing the minimum colors to be evaluated.
   * @param maxGradient - The gradient describing the maximum colors to be evaluated.
   */
  static createByRandomTwoGradient(minGradient: Gradient, maxGradient: Gradient): ColorGradient {
    const gradientColor: ColorGradient = new ColorGradient();
    gradientColor._mode = ParticleGradientMode.TwoGradients;
    gradientColor._gradientMin = minGradient;
    gradientColor._gradientMax = maxGradient;
    return gradientColor;
  }

  private _mode: ParticleGradientMode = ParticleGradientMode.Color;

  private _color: Color = null;
  private _colorMin: Color = null;
  private _colorMax: Color = null;
  private _gradient: Gradient = null;
  private _gradientMin: Gradient = null;
  private _gradientMax: Gradient = null;

  /**
   * The mode that the Min-Max Gradient uses to evaluate colors.
   */
  get mode(): ParticleGradientMode {
    return this._mode;
  }

  /**
   * The constant color.
   */
  get color(): Color {
    return this._color;
  }

  /**
   * The constant color for the lower bound.
   */
  get colorMin(): Color {
    return this._colorMin;
  }

  /**
   * The constant color for the upper bound.
   */
  get colorMax(): Color {
    return this._colorMax;
  }

  /**
   * The gradient.
   */
  get gradient(): Gradient {
    return this._gradient;
  }

  /**
   * The gradient for the lower bound.
   */
  get gradientMin(): Gradient {
    return this._gradientMin;
  }

  /**
   * The gradient for the upper bound.
   */
  get gradientMax(): Gradient {
    return this._gradientMax;
  }

  /**
   * @override
   * @inheritDoc
   */
  cloneTo(destGradientColor: ColorGradient): void {
    destGradientColor._mode = this._mode;
    destGradientColor._color.copyFrom(this._color);
    destGradientColor._colorMin.copyFrom(this._colorMin);
    destGradientColor._colorMax.copyFrom(this._colorMax);
    destGradientColor._gradient.copyFrom(this._gradient);
    destGradientColor._gradientMin.copyFrom(this._gradientMin);
    destGradientColor._gradientMax.copyFrom(this._gradientMax);
  }

  /**
   * @override
   * @inheritDoc
   */
  clone(): ColorGradient {
    const destGradientColor: ColorGradient = new ColorGradient();
    this.cloneTo(destGradientColor);
    return destGradientColor;
  }
}
