import { KeyframeTangentType, KeyframeValueType } from "../KeyFrame";
import { AnimationCurveOwner } from "./AnimationCurveOwner";
/**
 * @internal
 */
export class CrossCurveData {
  curveOwner: AnimationCurveOwner<KeyframeTangentType, KeyframeValueType>;
  srcCurveIndex: number;
  destCurveIndex: number;
}
