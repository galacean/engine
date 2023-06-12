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
    this.finalValue = owner.getEvaluateValue(this.finalValue);
  }
}
