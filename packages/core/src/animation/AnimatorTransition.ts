import { AnimatorState } from "./AnimatorState";
import { AnimatorCondition } from "./AnimatorCondition";
export class AnimatorStateTransition {
  duration: number;
  offset: number;
  exitTime: number;
  conditions: AnimatorCondition[];
  destinationState: AnimatorState;
  mute: boolean;
  solo: boolean;
  /**
   * @internal
   */
  _crossFadeFrameTime: number = 0;

  addCondition(condition: AnimatorCondition) {}
  removeCondition(condition: AnimatorCondition) {}
}
