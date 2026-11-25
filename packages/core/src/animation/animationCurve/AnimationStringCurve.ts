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
@StaticInterfaceImplement<IAnimationCurveCalculator<string>>()
export class AnimationStringCurve extends AnimationCurve<string> {
  /** @internal */
  static _isCopyMode: boolean = false;
  /** @internal */
  static _supportInterpolationMode: boolean = false;

  /**
   * @internal
   */
  static _initializeOwner(owner: AnimationCurveOwner<string>): void {
    owner.defaultValue = "";
    owner.fixedPoseValue = "";
    owner.baseEvaluateData.value = "";
    owner.crossEvaluateData.value = "";
  }

  /**
   * @internal
   */
  static _initializeLayerOwner(owner: AnimationCurveLayerOwner): void {
    owner.finalValue = "";
  }

  /**
   * @internal
   */
  static _lerpValue(srcValue: string, _destValue: string): string {
    return srcValue;
  }

  /**
   * @internal
   */
  static _subtractValue(src: string, _base: string, _out: string): string {
    return src;
  }

  /**
   * @internal
   */
  static _getZeroValue(): string {
    return "";
  }

  /**
   * @internal
   */
  static _additiveValue(value: string, _weight: number, _source: string): string {
    return value;
  }

  /**
   * @internal
   */
  static _setValue(value: string): string {
    return value;
  }

  private _discreteValues: string[] = [];

  constructor() {
    super();
    this._evaluateData.value = "";
  }

  /**
   * Replace all keyframes with parallel timestamp and value arrays.
   * @param times - Keyframe timestamps in seconds
   * @param values - Keyframe string values matching `times`
   */
  setKeys(times: TypedArray, values: readonly string[]): void {
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

  protected override _evaluateKey(index: number): string {
    return this._discreteValues[index];
  }

  protected override _readKeyAt(index: number, out: Keyframe<string>): void {
    this._readDiscreteKey(this._discreteValues, index, out);
  }

  protected override _writeKeyAt(index: number, key: Keyframe<string>): void {
    this._writeDiscreteKey(this._discreteValues, index, key);
  }
}
