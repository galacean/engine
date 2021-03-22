import { AnimationClip } from "./AnimationClip";
import { AnimatorStateMachine } from "./AnimatorStateMachine";
export enum AnimatorLayerBlendingMode {
  Override,
  Additive
}

export class AnimatorControllerLayer {
  weight: number = 1;
  blendingMode: AnimatorLayerBlendingMode = AnimatorLayerBlendingMode.Override;
  stateMachine: AnimatorStateMachine;
  frameTime: number = 0;
  /**
   * @constructor
   * @param name - The AnimationClip's name.
   */
  constructor(public readonly name: string) {}
}
