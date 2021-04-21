import { AnimatorState } from "./AnimatorState";
import { AnimatorCondition } from "./AnimatorCondition";
export class AnimatorStateTransition {
  /**
   * The duration of the transition. This is represented in normalized time.
   */
  duration: number;
  /**
   * The time at which the destination state will start. This is represented in normalized time.
   */
  offset: number;
  /**
   * ExitTime represents the exact time at which the transition can take effect. This is represented in normalized time.
   */
  exitTime: number;
  /**
   * TODO
   * AnimatorCondition conditions that need to be met for a transition to happen.
   */
  conditions: AnimatorCondition[];
  /**
   * The destination state of the transition.
   */
  destinationState: AnimatorState;
  /**
   * Mutes the transition. The transition will never occur.
   */
  mute: boolean;
  /**
   * Mutes all other transitions in the source state.
   */
  solo: boolean;

  /**
   * @internal
   */
  _crossFadeFrameTime: number = 0;

  /**
   * TODO
   * Add a condition to a transition.
   * @param condition
   */
  addCondition(condition: AnimatorCondition) {}

  /**
   * TODO
   * Remove a condition from the transition.
   * @param condition The condition.
   */
  removeCondition(condition: AnimatorCondition) {}
}
