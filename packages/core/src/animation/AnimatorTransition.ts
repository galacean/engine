import { AnimatorState } from "./AnimatorState";
import { AnimatorCondition } from "./AnimatorCondition";
export class AnimatorStateTransition {
  duration: number;
  offset: number;
  conditions: AnimatorCondition[];
  destinationState: AnimatorState;

  addCondition(condition: AnimatorCondition) {}
  removeCondition(condition: AnimatorCondition) {}
}
