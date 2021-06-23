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
}
