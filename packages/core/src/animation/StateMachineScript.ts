import { Animator } from "../animation/Animator";
import { AnimatorState } from "../animation/AnimatorState";

/**
 * StateMachineScript is a component that can be added to a animator state. It's the base class every script on a state derives from.
 */
export class StateMachineScript {
  /** @internal */
  _destroyed: boolean = false;
  /** @internal */
  _state: AnimatorState;
  /**
   * onStateEnter is called when a transition starts and the state machine starts to evaluate this state.
   * @param animator - The animator
   * @param animatorState - The state be evaluated
   * @param layerIndex - The index of the layer where the state is located
   */
  onStateEnter(animator: Animator, animatorState: AnimatorState, layerIndex: number): void {}

  /**
   * onStateUpdate is called on each Update frame between onStateEnter and onStateExit callbacks.
   * @param animator - The animator
   * @param animatorState - The state be evaluated
   * @param layerIndex - The index of the layer where the state is located
   */
  onStateUpdate(animator: Animator, animatorState: AnimatorState, layerIndex: number): void {}

  /**
   * onStateExit is called when a transition ends and the state machine finishes evaluating this state.
   * @param animator - The animator
   * @param animatorState - The state be evaluated
   * @param layerIndex - The index of the layer where the state is located
   */
  onStateExit(animator: Animator, animatorState: AnimatorState, layerIndex: number): void {}

  /**
   * Destroy this instance.
   */
  destroy(): void {
    if (this._destroyed) {
      return;
    }

    this._state._removeStateMachineScript(this);
    this._destroyed = true;
  }
}
