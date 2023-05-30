import { KeyframeValueType } from "../Keyframe";
import { AnimationCurveOwner } from "./animationCurveOwner/AnimationCurveOwner";
import { AnimationCurveOwnerLayerData } from "./AnimationCurveOwnerLayerData";
import { AnimationEventHandler } from "./AnimationEventHandler";

/**
 * @internal
 */
export class AnimatorStateData {
  curveOwnerLayerData: AnimationCurveOwnerLayerData[] = [];
  curveOwnerMap: WeakMap<AnimationCurveOwner<KeyframeValueType>, AnimationCurveOwnerLayerData> = new WeakMap();
  eventHandlers: AnimationEventHandler[] = [];
}
