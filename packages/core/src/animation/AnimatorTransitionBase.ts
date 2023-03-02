import { AnimatorStateMachine } from "./AnimatorStateMachine";
import { AnimatorState } from "./AnimatorState";

/**
 * Base class for animator transitions. Transitions define when and how the state machine switches from one state to another.
 */
export class AnimatorTransitionBase {
  /** The destination state of the transition. */
  destinationState?: AnimatorState;

  destinationStateMachine?: AnimatorStateMachine;

  /**
   * @internal
   */
  _hasDestination(): boolean {
    return !!(this.destinationState || this.destinationStateMachine);
  }
}
