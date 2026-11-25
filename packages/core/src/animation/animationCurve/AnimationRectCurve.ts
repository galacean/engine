import { Rect } from "@galacean/engine-math";
import { TypedArray } from "../../base/Constant";
import { StaticInterfaceImplement } from "../../base/StaticInterfaceImplement";
import { AnimationCurveLayerOwner } from "../internal/AnimationCurveLayerOwner";
import { AnimationCurveOwner } from "../internal/animationCurveOwner/AnimationCurveOwner";
import { Keyframe } from "../Keyframe";
import { AnimationCurve } from "./AnimationCurve";
import { IAnimationCurveCalculator } from "./interfaces/IAnimationCurveCalculator";

/**
 * Store a collection of Keyframes that can be evaluated over time.
 */
@StaticInterfaceImplement<IAnimationCurveCalculator<Rect>>()
export class AnimationRectCurve extends AnimationCurve<Rect> {
  /** @internal */
  static readonly _isCopyMode = true;
  /** @internal */
  static _supportInterpolationMode: boolean = false;

  /**
   * @internal
   */
  static _initializeOwner(owner: AnimationCurveOwner<Rect>): void {
    owner.defaultValue = new Rect();
    owner.fixedPoseValue = new Rect();
    owner.baseEvaluateData.value = new Rect();
  }

  /**
   * @internal
   */
  static _initializeLayerOwner(owner: AnimationCurveLayerOwner): void {
    owner.finalValue = new Rect();
  }

  /**
   * @internal
   */
  static _setValue(source: Rect, out: Rect): Rect {
    out.copyFrom(source);
    return out;
  }

  constructor() {
    super(4);
    this._evaluateData.value = new Rect();
  }

  /**
   * Replace all keyframes with packed `Rect` buffers (`x, y, width, height`).
   * @param times - Keyframe timestamps in seconds; must be sorted in ascending (non-decreasing) order
   * @param values - Packed scalars (`4` per keyframe)
   * @throws Error If `values.length` does not match `times.length * 4`
   * @remarks Non-empty inputs retain `times` and `values` directly by reference (copy-on-write on `addKey`, `setKey`, or `removeKey`) without validating or sorting timestamp order; callers must pass non-decreasing `times` and must not mutate retained buffers.
   */
  setKeys(times: TypedArray, values: TypedArray): void {
    this._setNumericKeys(times, values, 4, false);
  }

  protected override _evaluateKey(index: number, out: Rect): Rect {
    const values = this._values;
    const offset = index * 4;
    return out.set(values[offset], values[offset + 1], values[offset + 2], values[offset + 3]);
  }

  protected override _readKeyAt(index: number, out: Keyframe<Rect>): void {
    const values = this._values;
    const offset = index * 4;
    (out.value ||= new Rect()).set(values[offset], values[offset + 1], values[offset + 2], values[offset + 3]);
    out.inTangent = undefined;
    out.outTangent = undefined;
  }

  protected override _writeKeyAt(index: number, key: Keyframe<Rect>): void {
    const values = this._values;
    const { value } = key;
    const offset = index * 4;
    values[offset] = value.x;
    values[offset + 1] = value.y;
    values[offset + 2] = value.width;
    values[offset + 3] = value.height;
  }
}
