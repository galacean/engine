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

  initFinalValue() {
    const { cureType, defaultValue } = this.curveOwner;

    if (cureType._isReferenceType) {
      cureType._copyValue(defaultValue, this.finalValue);
    } else {
      this.finalValue = defaultValue;
    }
  }

  saveFinalValue(): void {
    this.finalValue = this.curveOwner.getEvaluateValue(this.finalValue);
  }
}
