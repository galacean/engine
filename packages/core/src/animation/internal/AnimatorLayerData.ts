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
  animatorStateDataMap: Record<string, AnimatorStateData> = Object.create(null);
  /** Per-state PlayData handles. Lazy populated. */
  statePlayDataMap: Record<string, AnimatorStatePlayData> = Object.create(null);
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
    const statePlayDataMap = this.statePlayDataMap;
    const stateName = state.name;
    let playData = statePlayDataMap[stateName];
    if (!playData || playData.state !== state) {
      playData = new AnimatorStatePlayData(state);
      statePlayDataMap[stateName] = playData;
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
