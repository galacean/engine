import { Vector2 } from "@galacean/engine-math";
import { StaticInterfaceImplement } from "../../base/StaticInterfaceImplement";
import { readObjectKey } from "../internal/AnimationCurvePack";
import { Keyframe } from "../Keyframe";
import { AnimationComponentCurve } from "./AnimationComponentCurve";
import { IAnimationCurveCalculator } from "./interfaces/IAnimationCurveCalculator";

/**
 * Store a collection of Keyframes that can be evaluated over time.
 */
@StaticInterfaceImplement<IAnimationCurveCalculator<Vector2>>()
export class AnimationVector2Curve extends AnimationComponentCurve<Vector2> {
  /** @internal */
  static override readonly _keyValueSize = 2;
  /** @internal */
  static override readonly _componentType = Vector2;

  protected override _subtractFirstKey(out: Vector2): Vector2 {
    const values = this._values;
    const offset = this._hasTangents ? 2 : 0;
    return out.set(out.x - values[offset], out.y - values[offset + 1]);
  }

  protected override _readKeyAt(index: number, out: Keyframe<Vector2>): void {
    readObjectKey(this._values, this._valueSize, this._hasTangents, index, out, Vector2, Vector2);
  }
}
