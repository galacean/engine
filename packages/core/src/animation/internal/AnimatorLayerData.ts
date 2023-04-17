import { AnimatorStateTransition } from "../AnimatorTransition";
import { LayerState } from "../enums/LayerState";
import { KeyframeValueType } from "../Keyframe";
import { AnimationCurveOwner } from "./AnimationCurveOwner/AnimationCurveOwner";
import { AnimatorStateData } from "./AnimatorStateData";
import { AnimatorStatePlayData } from "./AnimatorStatePlayData";

/**
 * @internal
 */
export class AnimatorLayerData {
  animatorStateDataMap: Record<string, AnimatorStateData> = {};
  srcPlayData: AnimatorStatePlayData = new AnimatorStatePlayData();
  destPlayData: AnimatorStatePlayData = new AnimatorStatePlayData();
  layerState: LayerState = LayerState.Standby;
  crossCurveMark: number = 0;
  manuallyTransition: AnimatorStateTransition = new AnimatorStateTransition();
  crossFadeTransition: AnimatorStateTransition;
  layerIndex: number;
  crossOwnerCollection: AnimationCurveOwner<KeyframeValueType>[] = [];

  constructor(layerIndex: number) {
    this.layerIndex = layerIndex;
  }

  switchPlayData(): void {
    const srcPlayData = this.destPlayData;
    const switchTemp = this.srcPlayData;
    this.srcPlayData = srcPlayData;
    this.destPlayData = switchTemp;
  }
}
