import { AnimatorControllerParameterValue } from "./AnimatorControllerParameter";
import { AnimatorConditionMode } from "./enums/AnimatorConditionMode";
import { AnimatorCondition } from "./AnimatorCondition";
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
  /** Mutes the transition. The transition will never occur. */
  mute: boolean = false;
  /** Is the transition destination the exit of the current state machine. */
  isExit: boolean = false;
  /** @internal */
  _srcState: AnimatorState;

  private _conditions: AnimatorCondition[] = [];
  private _solo = false;

  /** Mutes all other transitions in the source state. */
  get solo(): boolean {
    return this._solo;
  }

  set solo(value: boolean) {
    if (this._solo === value) return;
    this._solo = value;
    if (value) {
      this._srcState && this._srcState._updateSoloTransition(true);
    } else {
      this._srcState && this._srcState._updateSoloTransition();
    }
  }
  /**
   * The conditions in the transition.
   */
  get conditions(): Readonly<AnimatorCondition[]> {
    return this._conditions;
  }

  /**
   * Add a condition to a transition.
   * @param mode - The AnimatorCondition mode of the condition
   * @param parameter - The name of the parameter
   * @param threshold - The threshold value of the condition
   */
  addCondition(
    mode: AnimatorConditionMode,
    parameter: string,
    threshold?: AnimatorControllerParameterValue
  ): AnimatorCondition;

  /**
   * Add a condition to a transition.
   * @param animatorCondition - The condition to add
   */
  addCondition(animatorCondition: AnimatorCondition): AnimatorCondition;

  addCondition(
    param: AnimatorConditionMode | AnimatorCondition,
    parameter?: string,
    threshold?: AnimatorControllerParameterValue
  ) {
    if (typeof param === "object") {
      this._conditions.push(param);
      return param;
    } else {
      const condition = new AnimatorCondition();
      condition.mode = param;
      condition.parameter = parameter;
      condition.threshold = threshold;
      this._conditions.push(condition);
      return condition;
    }
  }

  /**
   * Remove a condition from the transition.
   * @param condition - The condition to remove
   */
  removeCondition(condition: AnimatorCondition) {
    const index = this._conditions.indexOf(condition);
    index !== -1 && this._conditions.splice(index, 1);
  }
}
