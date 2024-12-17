import { Color, MathUtil, Vector2, Vector3, Vector4 } from "@galacean/engine-math";
import { Texture } from "../texture";

type ValueType = number | Color | Vector2 | Vector3 | Vector4 | boolean | Texture;
enum ValueTypeEnum {
  Number,
  Color,
  Vector2,
  Vector3,
  Vector4,
  Other
}

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

  private readonly _valueType: ValueTypeEnum;
  private readonly _canLerp: boolean;

  private _value: ValueType;

  /**
   * The value of the parameter.
   */
  get value(): T {
    return this._value as T;
  }

  set value(value: ValueType) {
    if (this._valueType === ValueTypeEnum.Number) {
      this._value = MathUtil.clamp(<number>value, this._min, this._max);
    } else {
      this._value = value;
    }
  }

  constructor(
    value: ValueType,
    private _needLerp = false,
    private _min = Number.NEGATIVE_INFINITY,
    private _max = Number.POSITIVE_INFINITY
  ) {
    if (typeof value === "number") {
      this._valueType = ValueTypeEnum.Number;
    } else if (value instanceof Color) {
      this._valueType = ValueTypeEnum.Color;
    } else if (value instanceof Vector2) {
      this._valueType = ValueTypeEnum.Vector2;
    } else if (value instanceof Vector3) {
      this._valueType = ValueTypeEnum.Vector3;
    } else if (value instanceof Vector4) {
      this._valueType = ValueTypeEnum.Vector4;
    } else {
      this._valueType = ValueTypeEnum.Other;
    }

    this._canLerp = this._valueType !== ValueTypeEnum.Other;

    this.value = value;
  }

  /**
   * Interpolates from the current value to the end value by an interpolation factor.
   * @param to - The end value
   * @param interpFactor - The interpolation factor in range [0,1]
   */
  lerp(to: ValueType, interpFactor: number) {
    if (this._canLerp && this._needLerp) {
      switch (this._valueType) {
        case ValueTypeEnum.Number:
          this.value = MathUtil.lerp(<number>this.value, <number>to, interpFactor);
          break;
        case ValueTypeEnum.Color:
          Color.lerp(<Color>this.value, <Color>to, interpFactor, <Color>this.value);
          break;
        case ValueTypeEnum.Vector2:
          Vector2.lerp(<Vector2>this.value, <Vector2>to, interpFactor, <Vector2>this.value);
          break;
        case ValueTypeEnum.Vector3:
          Vector3.lerp(<Vector3>this.value, <Vector3>to, interpFactor, <Vector3>this.value);
          break;
        case ValueTypeEnum.Vector4:
          Vector4.lerp(<Vector4>this.value, <Vector4>to, interpFactor, <Vector4>this.value);
          break;
      }
    } else if (interpFactor > 0) {
      this.value = to;
    }
  }
}
