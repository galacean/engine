import { AnimatorState } from '../animation/AnimatorState';
import { Animator } from "../animation/Animator";
/**
 * Script class, used for logic writing.
 */
export class StateMachineScript {
  constructor(animatorState: AnimatorState) {
  }
  // Start is called before the first frame update
  onStart() {}
  // onStateEnter is called when a transition starts and the state machine starts to evaluate this state
  onStateEnter(animator: Animator, stateInfo: any, layerIndex: number) {}

  // onStateUpdate is called on each Update frame between onStateEnter and onStateExit callbacks
  onStateUpdate(animator: Animator, stateInfo: any, layerIndex: number) {}

  // onStateExit is called when a transition ends and the state machine finishes evaluating this state
  onStateExit(animator: Animator, stateInfo: any, layerIndex: number) {}
}
