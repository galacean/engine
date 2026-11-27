import { Vector3 } from "@galacean/engine-math";
import { StaticInterfaceImplement } from "../../base/StaticInterfaceImplement";
import { readObjectKey } from "../internal/AnimationCurvePack";
import { Keyframe } from "../Keyframe";
import { AnimationComponentCurve } from "./AnimationComponentCurve";
import { IAnimationCurveCalculator } from "./interfaces/IAnimationCurveCalculator";

/**
 * Store a collection of Keyframes that can be evaluated over time.
 */
@StaticInterfaceImplement<IAnimationCurveCalculator<Vector3>>()
export class AnimationVector3Curve extends AnimationComponentCurve<Vector3> {
  /** @internal */
  static override readonly _keyValueSize = 3;
  /** @internal */
  static override readonly _componentType = Vector3;

  protected override _subtractFirstKey(out: Vector3): Vector3 {
    const values = this._values;
    const offset = this._hasTangents ? 3 : 0;
    return out.set(out.x - values[offset], out.y - values[offset + 1], out.z - values[offset + 2]);
  }

  protected override _readKeyAt(offset: number, out: Keyframe<Vector3>, inOffset: number, outOffset: number): void {
    readObjectKey(this._values, offset, inOffset, outOffset, out, Vector3, Vector3);
  }
}
