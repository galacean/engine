import { AnimationCurveOwnerLayerData } from "./AnimationCurveOwnerLayerData";
import { AnimationEventHandler } from "./AnimationEventHandler";

/**
 * @internal
 */
export class AnimatorStateData {
  curveOwnerLayerData: AnimationCurveOwnerLayerData[] = [];
  eventHandlers: AnimationEventHandler[] = [];
}
