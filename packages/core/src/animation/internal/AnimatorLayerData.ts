import { AnimatorControllerLayer } from "../AnimatorControllerLayer";
import { AnimatorState } from "../AnimatorState";
import { AnimatorStateDef } from "../AnimatorStateDef";
import { AnimatorStateTransition } from "../AnimatorStateTransition";
import { LayerState } from "../enums/LayerState";
import { AnimationCurveLayerOwner } from "./AnimationCurveLayerOwner";
import { AnimatorStateData } from "./AnimatorStateData";
import { AnimatorStateRuntime } from "./AnimatorStateRuntime";

/**
 * @internal
 */
export class AnimatorLayerData {
  layerIndex: number;
  layer: AnimatorControllerLayer;
  curveOwnerPool: Record<number, Record<string, AnimationCurveLayerOwner>> = Object.create(null);
  animatorStateDataMap: Record<string, AnimatorStateData> = Object.create(null);
  /** Per-state user-facing view containers. Lazy populated. */
  stateMap: Record<string, AnimatorState> = Object.create(null);
  /** Currently playing state's runtime; null when standby. */
  srcRuntime: AnimatorStateRuntime | null = null;
  /** Cross-fade target state's runtime; null when not cross-fading. */
  destRuntime: AnimatorStateRuntime | null = null;
  layerState: LayerState = LayerState.Standby;
  crossCurveMark: number = 0;
  manuallyTransition: AnimatorStateTransition = new AnimatorStateTransition();
  crossFadeTransition: AnimatorStateTransition;
  crossLayerOwnerCollection: AnimationCurveLayerOwner[] = [];

  /**
   * Get or lazily create the persistent (state-view, runtime) pair for a def.
   * Rebuilds when the cached view is bound to a different def object
   * (same-name remove + re-add).
   */
  getOrCreateRuntime(def: AnimatorStateDef): AnimatorStateRuntime {
    const map = this.stateMap;
    const name = def.name;
    let state = map[name];
    if (state?.def !== def) {
      state = new AnimatorState(def);
      new AnimatorStateRuntime(state);
      map[name] = state;
    }
    return state._runtime;
  }

  /** After cross-fade completes, promote destRuntime to srcRuntime. */
  promoteDest(): void {
    this.srcRuntime = this.destRuntime;
    this.destRuntime = null;
  }

  resetCurrentCheckIndex(): void {
    this.layer.stateMachine._entryTransitionCollection.needResetCurrentCheckIndex = true;
    this.layer.stateMachine._anyStateTransitionCollection.needResetCurrentCheckIndex = true;
  }
}
