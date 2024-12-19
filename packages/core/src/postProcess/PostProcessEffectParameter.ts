import { Color, MathUtil, Vector2, Vector3, Vector4 } from "@galacean/engine-math";

/**
 * Represents a parameter of a post process effect.
 * @remarks
 * The parameter will be mixed to a final value and be used in post process manager.
 */
export class PostProcessEffectParameter<T> {
  /**
   * Whether the parameter is enabled.
   */
  enabled = true;

  private _value: T;
  private _needLerp = false;
  private _min = Number.NEGATIVE_INFINITY;
  private _max = Number.POSITIVE_INFINITY;

  /**
   * The value of the parameter.
   */
  get value(): T {
    return this._value;
  }

  set value(value: T) {
    if (this.value?.constructor === Number) {
      this._value = <T>MathUtil.clamp(<number>value, this._min, this._max);
    } else {
      this._value = value;
    }
  }

  constructor(value: T, needLerp?: boolean);
  constructor(value: T, min?: number, max?: number, needLerp?: boolean);

  constructor(value: T, needLerpOrMin?: boolean | number, max?: number, needLerp?: boolean) {
    if (typeof needLerpOrMin === "boolean") {
      this._needLerp = needLerpOrMin;
    } else if (typeof needLerpOrMin === "number" || typeof max === "number" || typeof needLerp === "boolean") {
      this._min = needLerpOrMin ?? Number.NEGATIVE_INFINITY;
      this._max = max ?? Number.POSITIVE_INFINITY;
      this._needLerp = needLerp ?? false;
    }

    this.value = value;
  }

  /**
   * Interpolates from the current value to the end value by an interpolation factor.
   * @param to - The end value
   * @param interpFactor - The interpolation factor in range [0,1]
   */
  lerp(to: T, interpFactor: number) {
    if (this._needLerp) {
      switch (this.value?.constructor) {
        case Number:
          this.value = <T>MathUtil.lerp(<number>this.value, <number>to, interpFactor);
          break;
        case Color:
          Color.lerp(<Color>this.value, <Color>to, interpFactor, <Color>this.value);
          break;
        case Vector2:
          Vector2.lerp(<Vector2>this.value, <Vector2>to, interpFactor, <Vector2>this.value);
          break;
        case Vector3:
          Vector3.lerp(<Vector3>this.value, <Vector3>to, interpFactor, <Vector3>this.value);
          break;
        case Vector4:
          Vector4.lerp(<Vector4>this.value, <Vector4>to, interpFactor, <Vector4>this.value);
          break;
        default:
          if (interpFactor > 0) {
            this.value = to;
          }
      }
    } else if (interpFactor > 0) {
      this.value = to;
    }
  }
}
