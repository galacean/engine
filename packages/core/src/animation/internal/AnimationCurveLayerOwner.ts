import { KeyframeValueType } from "../Keyframe";
import { AnimationCurveOwner } from "./animationCurveOwner/AnimationCurveOwner";

/**
 * @internal
 */
export class AnimationCurveLayerOwner {
  crossSrcCurveIndex: number;
  crossDestCurveIndex: number;
  crossCurveMark: number = 0;
  curveOwner: AnimationCurveOwner<KeyframeValueType>;
  finalValue: KeyframeValueType;

  saveFinalValue(): void {
    const owner = this.curveOwner;
    if (owner.cureType._isReferenceType) {
      owner.getEvaluateValue(this.finalValue);
    } else {
      this.finalValue = owner.getEvaluateValue(this.finalValue);
    }
  }
}
