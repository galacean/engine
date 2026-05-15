import { AnimatorState } from "../AnimatorState";
import { AnimationCurveLayerOwner } from "./AnimationCurveLayerOwner";
import { AnimationEventHandler } from "./AnimationEventHandler";

/**
 * @internal
 */
export class AnimatorStateData {
  curveLayerOwner: AnimationCurveLayerOwner[] = [];
  eventHandlers: AnimationEventHandler[] = [];
  /** Snapshot of `state.clip._updateFlagManager._version` when eventHandlers were last built. */
  eventsBuiltVersion: number = -1;

  constructor(readonly state: AnimatorState) {}
}
