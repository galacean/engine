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
  static override readonly _keyValueSize = 4;
  /** @internal */
  static readonly _isCopyMode = true;
  /** @internal */
  static readonly _supportInterpolationMode = false;

  protected declare _values: TypedArray;

  /**
   * @internal
   */
  static _initializeOwner(owner: AnimationCurveOwner<Rect>): void {
    owner.defaultValue = new Rect();
    owner.fixedPoseValue = new Rect();
    owner.baseEvaluateData.value = new Rect();
    owner.crossEvaluateData.value = new Rect();
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
    super();
    this._evaluateData.value = new Rect();
  }

  protected override _evaluateKey(index: number, out: Rect): Rect {
    const values = this._values;
    const offset = index * 4;
    return out.set(values[offset], values[offset + 1], values[offset + 2], values[offset + 3]);
  }

  protected override _readKeyAt(offset: number, out: Keyframe<Rect>): void {
    const values = this._values;
    (out.value ||= new Rect()).set(values[offset], values[offset + 1], values[offset + 2], values[offset + 3]);
    out.inTangent = undefined;
    out.outTangent = undefined;
  }
}
