import { AnimatorControllerParameterValue } from "./AnimatorControllerParameter";
import { AnimatorConditionMode } from "./enums/AnimatorConditionMode";

/**
 * Condition that is used to determine if a transition must be taken.
 */
export class AnimatorCondition {
  /** The mode of the condition. */
  mode: AnimatorConditionMode;
  /** The name of the parameter used in the condition. */
  parameter: string;
  /** The AnimatorParameter's threshold value for the condition to be true. */
  threshold?: AnimatorControllerParameterValue;
}
