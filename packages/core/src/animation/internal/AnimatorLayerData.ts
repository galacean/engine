import { AnimatorStateTransition } from "../AnimatorTransition";
import { LayerState } from "../enums/LayerState";
import { AnimationCurveOwnerLayerData } from "./AnimationCurveOwnerLayerData";
import { AnimatorStateData } from "./AnimatorStateData";
import { AnimatorStatePlayData } from "./AnimatorStatePlayData";

/**
 * @internal
 */
export class AnimatorLayerData {
  curveOwnerPool: Record<number, Record<string, AnimationCurveOwnerLayerData>> = {};

  animatorStateDataMap: Record<string, AnimatorStateData> = {};
  srcPlayData: AnimatorStatePlayData = new AnimatorStatePlayData();
  destPlayData: AnimatorStatePlayData = new AnimatorStatePlayData();
  layerState: LayerState = LayerState.Standby;
  crossCurveMark: number = 0;
  manuallyTransition: AnimatorStateTransition = new AnimatorStateTransition();
  crossFadeTransition: AnimatorStateTransition;
  crossOwnerLayerDataCollection: AnimationCurveOwnerLayerData[] = [];

  switchPlayData(): void {
    const srcPlayData = this.destPlayData;
    const switchTemp = this.srcPlayData;
    this.srcPlayData = srcPlayData;
    this.destPlayData = switchTemp;
  }
}
