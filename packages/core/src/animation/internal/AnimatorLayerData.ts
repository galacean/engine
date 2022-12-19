import { AnimatorControllerLayer } from "../AnimatorControllerLayer";
import { AnimatorStateTransition } from "../AnimatorTransition";
import { LayerState } from "../enums/LayerState";
import { AnimatorStateData } from "./AnimatorStateData";
import { AnimatorStatePlayData } from "./AnimatorStatePlayData";

/**
 * @internal
 */
export class AnimatorLayerData {
  layer: AnimatorControllerLayer;
  animatorStateDataMap: Record<string, AnimatorStateData> = {};
  srcPlayData: AnimatorStatePlayData = new AnimatorStatePlayData();
  destPlayData: AnimatorStatePlayData = new AnimatorStatePlayData();
  layerState: LayerState = LayerState.Standby;
  crossCurveMark: number = 0;
  manuallyTransition: AnimatorStateTransition = new AnimatorStateTransition();
  crossFadeTransition: AnimatorStateTransition;

  constructor(public readonly layerIndex: number) {}

  switchPlayData(): void {
    const srcPlayData = this.destPlayData;
    const switchTemp = this.srcPlayData;
    this.srcPlayData = srcPlayData;
    this.destPlayData = switchTemp;
  }
}
