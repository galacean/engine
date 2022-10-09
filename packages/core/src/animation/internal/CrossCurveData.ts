import { KeyframeValueType } from "../Keyframe";
import { AnimationCurveOwner } from "./AnimationCurveOwner/AnimationCurveOwner";
/**
 * @internal
 */
export class CrossCurveData {
  curveOwner: AnimationCurveOwner<KeyframeValueType>;
  srcCurveIndex: number;
  destCurveIndex: number;
}
