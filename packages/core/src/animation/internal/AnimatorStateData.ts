import { KeyFrameTangentType, KeyFrameValueType } from "../KeyFrame";
import { AnimationCurveOwner } from "./AnimationCurveOwner";
import { AnimationEventHandler } from "./AnimationEventHandler";

/**
 * @internal
 */
export class AnimatorStateData {
  curveOwners: AnimationCurveOwner<KeyFrameTangentType, KeyFrameValueType>[] = [];
  eventHandlers: AnimationEventHandler[] = [];
}
