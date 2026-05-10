import { AnimatorState } from "../AnimatorState";
import { AnimationCurveLayerOwner } from "./AnimationCurveLayerOwner";
import { AnimationEventHandler } from "./AnimationEventHandler";

/**
 * @internal
 */
export class AnimatorStateData {
  /** Source state this cached data was built against; used to detect identity change after remove/re-add. */
  state: AnimatorState | null = null;
  /** Listener registered on `state._updateFlagManager`; kept so we can detach when stateData is rebuilt. */
  clipChangedListener: (() => void) | null = null;
  curveLayerOwner: AnimationCurveLayerOwner[] = [];
  eventHandlers: AnimationEventHandler[] = [];
}
