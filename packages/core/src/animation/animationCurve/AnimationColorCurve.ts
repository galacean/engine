import { Color, Vector4 } from "@galacean/engine-math";
import { StaticInterfaceImplement } from "../../base/StaticInterfaceImplement";
import { readObjectKey } from "../internal/AnimationCurvePack";
import { Keyframe } from "../Keyframe";
import { AnimationComponentCurve } from "./AnimationComponentCurve";
import { IAnimationCurveCalculator } from "./interfaces/IAnimationCurveCalculator";

/**
 * Store a collection of Keyframes that can be evaluated over time.
 */
@StaticInterfaceImplement<IAnimationCurveCalculator<Color>>()
export class AnimationColorCurve extends AnimationComponentCurve<Color> {
  /** @internal */
  static override readonly _keyValueSize = 4;
  /** @internal */
  static override readonly _componentType = Color;

  protected override _subtractFirstKey(out: Color): Color {
    const values = this._values;
    const offset = this._hasTangents ? 4 : 0;
    return out.set(
      out.r - values[offset],
      out.g - values[offset + 1],
      out.b - values[offset + 2],
      out.a - values[offset + 3]
    );
  }

  protected override _readKeyAt(index: number, out: Keyframe<Color>): void {
    readObjectKey(this._values, this._valueSize, this._hasTangents, index, out, Color, Vector4);
  }
}
