import { IAnimationCurveCalculator } from "../animationCurve/interfaces/IAnimationCurveCalculator";
import { KeyframeValueType } from "../Keyframe";
import { AnimationCurveOwner } from "./animationCurveOwner/AnimationCurveOwner";

/**
 * @internal
 */
export class AnimationCurveLayerOwner<V extends KeyframeValueType> {
  crossSrcCurveIndex: number;
  crossDestCurveIndex: number;
  crossCurveMark: number = 0;
  curveOwner: AnimationCurveOwner<V>;
  lastValue: V;

  private _cureType: IAnimationCurveCalculator<V>;

  constructor(cureType: IAnimationCurveCalculator<V>) {
    this._cureType = cureType;
  }

  saveLastValue(): void {
    const owner = this.curveOwner;
    if (this._cureType._isReferenceType) {
      owner.getCurrentValue(this.lastValue);
    } else {
      this.lastValue = owner.getCurrentValue(this.lastValue);
    }
  }
}
