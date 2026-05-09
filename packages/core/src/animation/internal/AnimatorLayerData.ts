import { AnimatorControllerLayer } from "../AnimatorControllerLayer";
import { AnimatorState } from "../AnimatorState";
import { AnimatorStateTransition } from "../AnimatorStateTransition";
import { LayerState } from "../enums/LayerState";
import { AnimationCurveLayerOwner } from "./AnimationCurveLayerOwner";
import { AnimatorStateData } from "./AnimatorStateData";
import { AnimatorStatePlayData } from "../AnimatorStatePlayData";

/**
 * @internal
 */
export class AnimatorLayerData {
  layerIndex: number;
  layer: AnimatorControllerLayer;
  curveOwnerPool: Record<number, Record<string, AnimationCurveLayerOwner>> = Object.create(null);
  animatorStateDataMap: Record<string, AnimatorStateData> = {};
  /** Per-state PlayData handles. Lazy populated. */
  statePlayDataMap = new Map<AnimatorState, AnimatorStatePlayData>();
  /** Currently playing state's PlayData; null when standby. */
  srcPlayData: AnimatorStatePlayData | null = null;
  /** Cross-fade target state's PlayData; null when not cross-fading. */
  destPlayData: AnimatorStatePlayData | null = null;
  layerState: LayerState = LayerState.Standby;
  crossCurveMark: number = 0;
  manuallyTransition: AnimatorStateTransition = new AnimatorStateTransition();
  crossFadeTransition: AnimatorStateTransition;
  crossLayerOwnerCollection: AnimationCurveLayerOwner[] = [];

  /** Get or lazily create the persistent PlayData for a state. */
  getOrCreatePlayData(state: AnimatorState): AnimatorStatePlayData {
    let playData = this.statePlayDataMap.get(state);
    if (!playData) {
      playData = new AnimatorStatePlayData(state);
      this.statePlayDataMap.set(state, playData);
    }
    return playData;
  }

  /** After cross-fade completes, promote destPlayData to srcPlayData. */
  promoteDest(): void {
    this.srcPlayData = this.destPlayData;
    this.destPlayData = null;
  }

  resetCurrentCheckIndex(): void {
    this.layer.stateMachine._entryTransitionCollection.needResetCurrentCheckIndex = true;
    this.layer.stateMachine._anyStateTransitionCollection.needResetCurrentCheckIndex = true;
  }
}
