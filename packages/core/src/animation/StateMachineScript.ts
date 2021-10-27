import { Animator } from "../animation/Animator";
import { AnimatorState } from "../animation/AnimatorState";

/**
 * StateMachineScript is a component that can be added to a state. It's the base class every script on a state derives from.
 */
export class StateMachineScript {
  /**
   * onStateEnter is called when a transition starts and the state machine starts to evaluate this state.
   * @param animator - The animator.
   * @param stateInfo - The state be evaluated.
   * @param layerIndex - The index of the layer where the state is located.
   */
  onStateEnter(animator: Animator, stateInfo: AnimatorState, layerIndex: number) {}

  /**
   * onStateUpdate is called on each Update frame between onStateEnter and onStateExit callbacks.
   * @param animator - The animator.
   * @param stateInfo - The state be evaluated.
   * @param layerIndex - The index of the layer where the state is located.
   */
  onStateUpdate(animator: Animator, stateInfo: AnimatorState, layerIndex: number) {}

  /**
   * onStateExit is called when a transition ends and the state machine finishes evaluating this state.
   * @param animator - The animator.
   * @param stateInfo - The state be evaluated.
   * @param layerIndex - The index of the layer where the state is located.
   */
  onStateExit(animator: Animator, stateInfo: AnimatorState, layerIndex: number) {}
}
