import { AnimatorCondition } from "./AnimatorCondition";
import { AnimatorControllerParameterValue } from "./AnimatorControllerParameter";
import { AnimatorState } from "./AnimatorState";
import { AnimatorStateTransitionCollection } from "./AnimatorStateTransitionCollection";
import { AnimatorConditionMode } from "./enums/AnimatorConditionMode";

/**
 * Transitions define when and how the state machine switch from on state to another. AnimatorTransition always originate from a StateMachine or a StateMachine entry.
 */
export class AnimatorStateTransition {
  /** The duration of the transition. This is represented in normalized time. */
  duration = 0;
  /** The time at which the destination state will start. This is represented in normalized time. */
  offset = 0;
  /** ExitTime represents the exact time at which the transition can take effect. This is represented in normalized time. */
  exitTime = 1.0;
  /** The destination state of the transition. */
  destinationState: AnimatorState;
  /** Mutes the transition. The transition will never occur. */
  mute = false;
  /** Determines whether the duration of the transition is reported in a fixed duration in seconds or as a normalized time. */
  isFixedDuration = false;

  /** @internal */
  _collection: AnimatorStateTransitionCollection;
  /** @internal */
  _isExit = false;

  private _conditions: AnimatorCondition[] = [];
  private _solo = false;
  private _hasExitTime = true;

  /**
   * Is the transition destination the exit of the current state machine.
   */
  get isExit(): Readonly<boolean> {
    return this._isExit;
  }

  /**
   * Mutes all other transitions in the source state.
   */
  get solo(): boolean {
    return this._solo;
  }

  set solo(value: boolean) {
    if (this._solo === value) return;
    this._solo = value;
    this._collection?.updateTransitionSolo(value);
  }
  /**
   * The conditions in the transition.
   */
  get conditions(): Readonly<AnimatorCondition[]> {
    return this._conditions;
  }

  /**
   * When active the transition will have an exit time condition.
   */
  get hasExitTime(): boolean {
    return this._hasExitTime;
  }

  set hasExitTime(value: boolean) {
    if (this._hasExitTime === value) return;
    this._hasExitTime = value;
    this._collection?.updateTransitionsIndex(this, value);
  }

  get fixedDuration(): number {
    return this.isFixedDuration ? this.duration : this.duration * this.destinationState._getDuration();
  }

  /**
   * Add a condition to a transition.
   * @param parameterName - The name of the parameter
   * @param mode - The AnimatorCondition mode of the condition
   * @param threshold - The threshold value of the condition
   */
  addCondition(
    parameterName: string,
    mode?: AnimatorConditionMode,
    threshold?: AnimatorControllerParameterValue
  ): AnimatorCondition;

  /**
   * Add a condition to a transition.
   * @param animatorCondition - The condition to add
   */
  addCondition(animatorCondition: AnimatorCondition): AnimatorCondition;

  addCondition(
    param: string | AnimatorCondition,
    mode?: AnimatorConditionMode,
    threshold?: AnimatorControllerParameterValue
  ): AnimatorCondition {
    if (typeof param === "object") {
      this._conditions.push(param);
      return param;
    } else {
      const condition = new AnimatorCondition();
      condition.parameterName = param;
      condition.mode = mode ?? AnimatorConditionMode.If;
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
