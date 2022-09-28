import { KeyFrameTangentType, KeyFrameValueType } from "../KeyFrame";
import { AnimationCurveOwner } from "./AnimationCurveOwner";
/**
 * @internal
 */
export class CrossCurveData {
  curveOwner: AnimationCurveOwner<KeyFrameTangentType, KeyFrameValueType>;
  srcCurveIndex: number;
  destCurveIndex: number;
}
