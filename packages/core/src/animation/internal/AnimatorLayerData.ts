import { LayerState } from "../enums/LayerState";
import { AnimatorStateData } from "./AnimatorStataData";
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

  switchPlayData(): void {
    const srcPlayData = this.destPlayData;
    const switchTemp = this.srcPlayData;
    this.srcPlayData = srcPlayData;
    this.destPlayData = switchTemp;
  }
}
