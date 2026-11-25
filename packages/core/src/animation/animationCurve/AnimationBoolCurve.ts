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
@StaticInterfaceImplement<IAnimationCurveCalculator<boolean>>()
export class AnimationBoolCurve extends AnimationCurve<boolean> {
  /** @internal */
  static _isCopyMode: boolean = false;
  /** @internal */
  static _supportInterpolationMode: boolean = false;

  /**
   * @internal
   */
  static _initializeOwner(owner: AnimationCurveOwner<boolean>): void {
    owner.defaultValue = false;
    owner.fixedPoseValue = false;
    owner.baseEvaluateData.value = false;
    owner.crossEvaluateData.value = false;
  }

  /**
   * @internal
   */
  static _initializeLayerOwner(owner: AnimationCurveLayerOwner): void {
    owner.finalValue = false;
  }

  /**
   * @internal
   */
  static _lerpValue(srcValue: boolean, _destValue: boolean): boolean {
    return srcValue;
  }

  /**
   * @internal
   */
  static _subtractValue(src: boolean, _base: boolean, _out: boolean): boolean {
    return src;
  }

  /**
   * @internal
   */
  static _getZeroValue(): boolean {
    return false;
  }

  /**
   * @internal
   */
  static _additiveValue(value: boolean, _weight: number, _source: boolean): boolean {
    return value;
  }

  /**
   * @internal
   */
  static _setValue(value: boolean): boolean {
    return value;
  }

  private _discreteValues: boolean[] = [];

  constructor() {
    super();
    this._evaluateData.value = false;
  }

  /**
   * Replace all keyframes with parallel timestamp and value arrays.
   * @param times - Keyframe timestamps in seconds
   * @param values - Keyframe boolean values matching `times`
   */
  setKeys(times: TypedArray, values: readonly boolean[]): void {
    this._setDiscreteKeys(times, values, this._discreteValues);
  }

  protected override _ensureWritable(minKeyCount: number): void {
    this._ensureTimesWritable(minKeyCount);
    this._isBufferShared = false;
  }

  protected override _shiftValues(dstIndex: number, srcIndex: number, endIndex: number): void {
    this._shiftDiscreteValues(this._discreteValues, dstIndex, srcIndex, endIndex);
  }

  protected override _truncateValues(newCount: number): void {
    this._discreteValues.length = newCount;
  }

  protected override _clearValues(): void {
    this._discreteValues.length = 0;
  }

  protected override _evaluateKey(index: number): boolean {
    return this._discreteValues[index];
  }

  protected override _readKeyAt(index: number, out: Keyframe<boolean>): void {
    this._readDiscreteKey(this._discreteValues, index, out);
  }

  protected override _writeKeyAt(index: number, key: Keyframe<boolean>): void {
    this._writeDiscreteKey(this._discreteValues, index, key);
  }
}
