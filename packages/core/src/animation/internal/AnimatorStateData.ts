import { AnimatorState } from "../AnimatorState";
import { AnimationCurveLayerOwner } from "./AnimationCurveLayerOwner";
import { AnimationEventHandler } from "./AnimationEventHandler";

/**
 * @internal
 */
export class AnimatorStateData {
  curveLayerOwner: AnimationCurveLayerOwner[] = [];
  eventHandlers: AnimationEventHandler[] = [];
  animatorState: AnimatorState;
  clipChangedListener: () => void;
}
