import { Vector4 } from "@galacean/engine-math";
import { StaticInterfaceImplement } from "../../base/StaticInterfaceImplement";
import { readObjectKey } from "../internal/AnimationCurvePack";
import { Keyframe } from "../Keyframe";
import { AnimationComponentCurve } from "./AnimationComponentCurve";
import { IAnimationCurveCalculator } from "./interfaces/IAnimationCurveCalculator";

/**
 * Store a collection of Keyframes that can be evaluated over time.
 */
@StaticInterfaceImplement<IAnimationCurveCalculator<Vector4>>()
export class AnimationVector4Curve extends AnimationComponentCurve<Vector4> {
  /** @internal */
  static override readonly _keyValueSize = 4;
  /** @internal */
  static override readonly _componentType = Vector4;

  protected override _subtractFirstKey(out: Vector4): Vector4 {
    const values = this._values;
    const offset = this._hasTangents ? 4 : 0;
    return out.set(
      out.x - values[offset],
      out.y - values[offset + 1],
      out.z - values[offset + 2],
      out.w - values[offset + 3]
    );
  }

  protected override _readKeyAt(offset: number, out: Keyframe<Vector4>, inOffset: number, outOffset: number): void {
    readObjectKey(this._values, offset, inOffset, outOffset, out, Vector4, Vector4);
  }
}
