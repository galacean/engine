import { Component } from "../../Component";
import { AnimatorStateData } from "./AnimatorStataData";
import { AnimatorStatePlayData } from "./AnimatorStatePlayData";
import { LayerPlayState } from "../enums/LayerPlayState";

/**
 * @internal
 */
export class AnimatorLayerData {
  animatorStateDataMap: Record<string, AnimatorStateData> = {};
  srcPlayData: AnimatorStatePlayData = new AnimatorStatePlayData();
  destPlayData: AnimatorStatePlayData = new AnimatorStatePlayData();
  playState: LayerPlayState = LayerPlayState.Standby;
  crossCurveMark: number = 0;
}
