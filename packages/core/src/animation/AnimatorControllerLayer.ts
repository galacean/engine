import { AnimatorStateMachine } from "./AnimatorStateMachine";
import { AnimatorLayerBlendingMode } from "./enums/AnimatorLayerBlendingMode";

/**
 * The Animation Layer contains a state machine that controls animations of a model or part of it.
 */
export class AnimatorControllerLayer {
  /** The blending weight that the layers has. It is not taken into account for the first layer. */
  weight: number = 1;
  /** The blending mode used by the layer. It is not taken into account for the first layer. */
  blendingMode: AnimatorLayerBlendingMode = AnimatorLayerBlendingMode.Override;
  stateMachine: AnimatorStateMachine;

  /**
   * @param name - The layer's name
   */
  constructor(public readonly name: string) {}
}
