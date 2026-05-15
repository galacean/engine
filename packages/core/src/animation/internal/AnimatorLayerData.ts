import { AnimatorControllerLayer } from "../AnimatorControllerLayer";
import { AnimatorState } from "../AnimatorState";
import { AnimatorStateInstance } from "../AnimatorStateInstance";
import { AnimatorStateTransition } from "../AnimatorStateTransition";
import { LayerState } from "../enums/LayerState";
import { AnimationCurveLayerOwner } from "./AnimationCurveLayerOwner";
import { AnimatorStateData } from "./AnimatorStateData";
import type { AnimatorStatePlayData } from "./AnimatorStatePlayData";

/**
 * @internal
 */
export class AnimatorLayerData {
  layerIndex: number;
  layer: AnimatorControllerLayer;
  curveOwnerPool: Record<number, Record<string, AnimationCurveLayerOwner>> = Object.create(null);
  animatorStateDataMap: WeakMap<AnimatorState, AnimatorStateData> = new WeakMap();
  instanceMap: WeakMap<AnimatorState, AnimatorStateInstance> = new WeakMap();
  srcPlayData: AnimatorStatePlayData | null = null;
  destPlayData: AnimatorStatePlayData | null = null;
  layerState: LayerState = LayerState.Standby;
  crossCurveMark: number = 0;
  manuallyTransition: AnimatorStateTransition = new AnimatorStateTransition();
  crossFadeTransition: AnimatorStateTransition;
  crossLayerOwnerCollection: AnimationCurveLayerOwner[] = [];

  getOrCreateInstance(state: AnimatorState): AnimatorStateInstance {
    const map = this.instanceMap;
    let instance = map.get(state);
    if (!instance) {
      instance = new AnimatorStateInstance(state);
      map.set(state, instance);
    }
    return instance;
  }

  completeCrossFade(): void {
    this.srcPlayData = this.destPlayData;
    this.destPlayData = null;
    this.crossFadeTransition = null;
  }

  clearCrossFadeSlot(): void {
    this.destPlayData = null;
    this.crossFadeTransition = null;
  }

  resetCurrentCheckIndex(): void {
    this.layer.stateMachine._entryTransitionCollection.needResetCurrentCheckIndex = true;
    this.layer.stateMachine._anyStateTransitionCollection.needResetCurrentCheckIndex = true;
  }
}
