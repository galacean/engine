import { AnimatorStateData } from "./AnimatorStateData";

/**
 * @internal
 */
export class AnimatorLayerData {
  playingStateData: AnimatorStateData = new AnimatorStateData();
  fadingStateData: AnimatorStateData = new AnimatorStateData();
}
