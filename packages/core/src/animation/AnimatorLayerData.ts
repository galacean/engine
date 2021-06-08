import { Component } from "../Component";
import { AnimatorStateData } from "./AnimatorStateData";

/**
 * @internal
 */
export class AnimatorLayerData {
  playingStateData: AnimatorStateData<Component> = new AnimatorStateData<Component>();
  destStateData: AnimatorStateData<Component> = new AnimatorStateData();
}
