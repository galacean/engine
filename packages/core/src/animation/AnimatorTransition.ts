import { AnimatorState } from "./AnimatorState";

/**
 * Transitions define when and how the state machine switch from on state to another. AnimatorTransition always originate from a StateMachine or a StateMachine entry.
 */
export class AnimatorStateTransition {
  /** The duration of the transition. This is represented in normalized time. */
  duration: number = 0;
  /** The time at which the destination state will start. This is represented in normalized time. */
  offset: number = 0;
  /** ExitTime represents the exact time at which the transition can take effect. This is represented in normalized time. */
  exitTime: number = 1;
  /** The destination state of the transition. */
  destinationState: AnimatorState;
}
