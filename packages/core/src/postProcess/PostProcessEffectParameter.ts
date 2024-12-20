import { Color, MathUtil, Vector2, Vector3, Vector4 } from "@galacean/engine-math";
import { Texture } from "../texture/Texture";

/**
 * Represents a parameter of a post process effect.
 * @remarks
 * The parameter will be mixed to a final value and be used in post process manager.
 */
export class PostProcessEffectParameter<T extends Number | Boolean | Color | Vector2 | Vector3 | Vector4 | Texture> {
  /**
   * Whether the parameter is enabled.
   */
  enabled = true;

  private _value: T;
  private _needLerp = false;
  private _min?: number;
  private _max?: number;

  /**
   * The value of the parameter.
   */
  get value(): T {
    return this._value;
  }

  set value(value: T) {
    if (this.value?.constructor === Number) {
      this._value = <T>(<unknown>MathUtil.clamp(<number>value, this._min, this._max));
    } else {
      this._value = value;
    }
  }

  constructor(value: Exclude<T, number>, needLerp?: boolean);
  constructor(value: Exclude<T, Boolean | Color | Vector2 | Vector3 | Vector4 | Texture>, needLerp?: boolean);
  constructor(
    value: Exclude<T, Boolean | Color | Vector2 | Vector3 | Vector4 | Texture>,
    min?: number,
    max?: number,
    needLerp?: boolean
  );

  constructor(value: T, needLerpOrMin?: boolean | number, max?: number, needLerp?: boolean) {
    if (typeof value === "number") {
      if (typeof needLerpOrMin === "boolean") {
        this._needLerp = needLerpOrMin;
        this._min = Number.NEGATIVE_INFINITY;
        this._max = Number.POSITIVE_INFINITY;
      } else if (typeof needLerpOrMin === "number") {
        this._min = needLerpOrMin;
        this._max = max ?? Number.POSITIVE_INFINITY;
        this._needLerp = needLerp ?? false;
      } else if (needLerpOrMin == undefined) {
        this._min = Number.NEGATIVE_INFINITY;
        this._max = Number.POSITIVE_INFINITY;
      }
    } else {
      this._needLerp = <boolean>needLerpOrMin ?? false;
    }

    this.value = value;
  }

  /**
   * Interpolates from the current value to the end value by an interpolation factor.
   * @param to - The end value
   * @param factor - The interpolation factor in range [0,1]
   */
  lerp(to: T, factor: number) {
    if (this._needLerp) {
      switch (this.value?.constructor) {
        case Number:
          this.value = <T>(<unknown>MathUtil.lerp(<number>this.value, <number>to, factor));
          break;
        case Color:
          Color.lerp(<Color>this.value, <Color>to, factor, <Color>this.value);
          break;
        case Vector2:
          Vector2.lerp(<Vector2>this.value, <Vector2>to, factor, <Vector2>this.value);
          break;
        case Vector3:
          Vector3.lerp(<Vector3>this.value, <Vector3>to, factor, <Vector3>this.value);
          break;
        case Vector4:
          Vector4.lerp(<Vector4>this.value, <Vector4>to, factor, <Vector4>this.value);
          break;
        default:
          if (factor > 0) {
            this.value = to;
          }
      }
    } else if (factor > 0) {
      this.value = to;
    }
  }
}
