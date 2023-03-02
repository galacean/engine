import { AnimatorTransitionBase } from "./AnimatorTransitionBase";

/**
 * Transitions define when and how the state machine switch from one state to another. AnimatorStateTransition always originate from an Animator State and have timing parameters.
 */
export class AnimatorStateTransition extends AnimatorTransitionBase {
  /** The duration of the transition. This is represented in normalized time. */
  duration: number = 0;
  /** The time at which the destination state will start. This is represented in normalized time. */
  offset: number = 0;
  /** ExitTime represents the exact time at which the transition can take effect. This is represented in normalized time. */
  exitTime: number = 1;
}
