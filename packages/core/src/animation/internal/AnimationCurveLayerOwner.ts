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
}
