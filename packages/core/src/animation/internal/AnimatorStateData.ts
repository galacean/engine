import { AnimatorState } from "../AnimatorState";
import { AnimationCurveLayerOwner } from "./AnimationCurveLayerOwner";
import { AnimationEventHandler } from "./AnimationEventHandler";

/**
 * @internal
 */
export class AnimatorStateData {
  curveLayerOwner: AnimationCurveLayerOwner[] = [];
  eventHandlers: AnimationEventHandler[] = [];
  eventsBuiltVersion: number = -1;

  constructor(readonly state: AnimatorState) {}
}
