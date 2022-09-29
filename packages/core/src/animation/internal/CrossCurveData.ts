import { KeyframeValueType } from "../KeyFrame";
import { AnimationCurveOwner } from "./AnimationCurveOwner";
/**
 * @internal
 */
export class CrossCurveData {
  curveOwner: AnimationCurveOwner<KeyframeValueType>;
  srcCurveIndex: number;
  destCurveIndex: number;
}
