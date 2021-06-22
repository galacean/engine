import { Component } from "../Component";
import { AnimatorStateData } from "./AnimatorStataData";
import { AnimatorStatePlayData } from "./AnimatorStatePlayData";
import { LayerPlayState } from "./enums/LayerPlayState";

/**
 * @internal
 */
export class AnimatorLayerData {
  animatorStateDataCollection: Record<string, AnimatorStateData<Component>> = {};

  srcPlayData: AnimatorStatePlayData<Component> = new AnimatorStatePlayData();
  destPlayData: AnimatorStatePlayData<Component> = new AnimatorStatePlayData();
  playState: LayerPlayState = LayerPlayState.Standby;
  crossCurveMark: number = 0;
}
