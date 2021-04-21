import { AnimatorConditionMode } from "./enums/AnimatorConditionMode";

/**
 * TODO Condition that is used to determine if a transition must be taken.
 */
export class AnimatorCondition {
  mode: AnimatorConditionMode;
  threshold: number | boolean;
  parameter: string;
}
