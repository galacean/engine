import { AnimatorStateTransition } from "../AnimatorTransition";
import { KeyframeValueType } from "../Keyframe";
import { LayerState } from "../enums/LayerState";
import { AnimationCurveOwner } from "./animationCurveOwner/AnimationCurveOwner";
import { AnimationCurveOwnerLayerData } from "./AnimationCurveOwnerLayerData";
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
  crossOwnerLayerDataCollection: AnimationCurveOwnerLayerData[] = [];
  curveOwnerMap: WeakMap<AnimationCurveOwner<KeyframeValueType>, AnimationCurveOwnerLayerData> = new WeakMap();

  switchPlayData(): void {
    const srcPlayData = this.destPlayData;
    const switchTemp = this.srcPlayData;
    this.srcPlayData = srcPlayData;
    this.destPlayData = switchTemp;
  }
}
