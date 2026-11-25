import { ReferResource } from "../../asset/ReferResource";
import { TypedArray } from "../../base/Constant";
import { StaticInterfaceImplement } from "../../base/StaticInterfaceImplement";
import { AnimationCurveLayerOwner } from "../internal/AnimationCurveLayerOwner";
import { AnimationCurveOwner } from "../internal/animationCurveOwner/AnimationCurveOwner";
import { Keyframe } from "../Keyframe";
import { AnimationCurve } from "./AnimationCurve";
import { IAnimationCurveCalculator } from "./interfaces/IAnimationCurveCalculator";

/**
 * Animates resource references. A `null` keyframe clears the reference.
 */
@StaticInterfaceImplement<IAnimationCurveCalculator<ReferResource | null>>()
export class AnimationRefCurve extends AnimationCurve<ReferResource | null> {
  /** @internal */
  static _isCopyMode: boolean = false;
  /** @internal */
  static _supportInterpolationMode: boolean = false;

  /**
   * @internal
   */
  static _initializeOwner(_owner: AnimationCurveOwner<ReferResource | null>): void {}

  /**
   * @internal
   */
  static _initializeLayerOwner(_owner: AnimationCurveLayerOwner): void {}

  /**
   * @internal
   */
  static _setValue(value: ReferResource | null): ReferResource | null {
    return value;
  }

  private _discreteValues: (ReferResource | null)[] = [];

  constructor() {
    super();
  }

  /**
   * Replace all keyframes with parallel timestamp and resource-reference arrays.
   * @param times - Keyframe timestamps in seconds
   * @param values - Keyframe resource references matching `times`
   */
  setKeys(times: TypedArray, values: readonly (ReferResource | null)[]): void {
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

  protected override _evaluateKey(index: number): ReferResource | null {
    return this._discreteValues[index];
  }

  protected override _readKeyAt(index: number, out: Keyframe<ReferResource | null>): void {
    this._readDiscreteKey(this._discreteValues, index, out);
  }

  protected override _writeKeyAt(index: number, key: Keyframe<ReferResource | null>): void {
    this._writeDiscreteKey(this._discreteValues, index, key);
  }
}
