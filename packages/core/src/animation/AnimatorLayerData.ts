import { Component } from "../Component";
import { AnimatorStateData } from "./AnimatorStateData";
import { LayerPlayState } from "./enums/LayerPlayState";

/**
 * @internal
 */
export class AnimatorLayerData {
  playingStateData: AnimatorStateData<Component> = new AnimatorStateData<Component>();
  destStateData: AnimatorStateData<Component> = new AnimatorStateData();
  playState: LayerPlayState = LayerPlayState.Standby;
  crossCurveMark: number = 0;
}
