import { AnimatorControllerLayer } from "../AnimatorControllerLayer";
import { AnimatorState } from "../AnimatorState";
import { AnimatorStateInstance } from "../AnimatorStateInstance";
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
  instanceMap: Record<string, AnimatorStateInstance> = Object.create(null);
  srcRuntime: AnimatorStateRuntime | null = null;
  destRuntime: AnimatorStateRuntime | null = null;
  layerState: LayerState = LayerState.Standby;
  crossCurveMark: number = 0;
  manuallyTransition: AnimatorStateTransition = new AnimatorStateTransition();
  crossFadeTransition: AnimatorStateTransition;
  crossLayerOwnerCollection: AnimationCurveLayerOwner[] = [];

  /** Lazy-create the (instance, runtime) pair; rebuild if the asset was swapped. */
  getOrCreateRuntime(state: AnimatorState): AnimatorStateRuntime {
    const map = this.instanceMap;
    const name = state.name;
    let instance = map[name];
    if (instance?._state !== state) {
      instance = new AnimatorStateInstance(state);
      new AnimatorStateRuntime(instance);
      map[name] = instance;
    }
    return instance._runtime;
  }

  promoteDest(): void {
    this.srcRuntime = this.destRuntime;
    this.destRuntime = null;
  }

  resetCurrentCheckIndex(): void {
    this.layer.stateMachine._entryTransitionCollection.needResetCurrentCheckIndex = true;
    this.layer.stateMachine._anyStateTransitionCollection.needResetCurrentCheckIndex = true;
  }
}
