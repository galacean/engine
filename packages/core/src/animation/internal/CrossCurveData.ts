import { KeyframeValueType } from "../Keyframe";
import { AnimationCurveOwner } from "./animationCurveOwner/AnimationCurveOwner";
/**
 * @internal
 */
export class CrossCurveData {
  curveOwner: AnimationCurveOwner<KeyframeValueType>;
  srcCurveIndex: number;
  destCurveIndex: number;
}
