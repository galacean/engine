import { AnimatorStateData } from "./AnimatorStateData";

/**
 * @internal
 */
export class AnimatorLayerData {
  playingStateData: AnimatorStateData = new AnimatorStateData();
  destStateData: AnimatorStateData = new AnimatorStateData();
}
