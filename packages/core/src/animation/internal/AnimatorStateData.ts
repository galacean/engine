import { AnimatorState } from "../AnimatorState";
import { AnimationCurveLayerOwner } from "./AnimationCurveLayerOwner";
import { AnimationEventHandler } from "./AnimationEventHandler";

/**
 * @internal
 */
export class AnimatorStateData {
  /** Listener registered on `state._updateFlagManager`; kept so dispose() can detach it. */
  clipChangedListener: (() => void) | null = null;
  curveLayerOwner: AnimationCurveLayerOwner[] = [];
  eventHandlers: AnimationEventHandler[] = [];

  constructor(readonly state: AnimatorState) {}

  /** Detach the clipChangedListener from state's UpdateFlagManager. No-op if not attached. */
  dispose(): void {
    const { clipChangedListener } = this;
    if (clipChangedListener) {
      this.state._updateFlagManager.removeListener(clipChangedListener);
      this.clipChangedListener = null;
    }
  }
}
