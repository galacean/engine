import { AnimatorStateMachine } from "./AnimatorStateMachine";
export enum AnimatorLayerBlendingMode {
  Override,
  Additive
}

export class AnimatorControllerLayer {
  weight: number;
  name: string;
  blendingMode: AnimatorLayerBlendingMode;
  stateMachine: AnimatorStateMachine;
}
