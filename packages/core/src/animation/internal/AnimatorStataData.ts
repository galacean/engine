import { AnimationEventHandler } from "./AnimationEventHandler";
import { AnimationCurveOwner } from "./AnimationCurveOwner";

/**
 * @internal
 */
export class AnimatorStateData {
  curveOwners: AnimationCurveOwner[] = [];
  eventHandlers: AnimationEventHandler[] = [];
}
