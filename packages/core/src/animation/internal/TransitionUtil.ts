import { AnimatorState } from "../AnimatorState";
import { AnimatorStateMachine } from "../AnimatorStateMachine";
import { AnimatorStateTransition } from "../AnimatorStateTransition";

/**
 * @internal
 */
export class TransitionUtil {
  static addTransition(
    source: AnimatorState | AnimatorStateMachine,
    transitionOrAnimatorState: AnimatorStateTransition | AnimatorState,
    transitions: AnimatorStateTransition[]
  ): AnimatorStateTransition {
    let transition: AnimatorStateTransition;
    if (transitionOrAnimatorState instanceof AnimatorState) {
      transition = new AnimatorStateTransition();
      transition.hasExitTime = false;
      transition.destinationState = transitionOrAnimatorState;
    } else {
      transition = transitionOrAnimatorState;
    }
    transition._source = source;

    if (transition.hasExitTime) {
      this.addHasExitTimeTransition(transition, transitions);
    } else {
      transitions.unshift(transition);
    }
    return transition;
  }

  static removeTransition(transition: AnimatorStateTransition, transitions: AnimatorStateTransition[]): void {
    const index = transitions.indexOf(transition);
    index !== -1 && transitions.splice(index, 1);
    transition._source = null;
  }

  static addHasExitTimeTransition(transition: AnimatorStateTransition, transitions: AnimatorStateTransition[]): void {
    const time = transition.exitTime;
    const count = transitions.length;
    const maxExitTime = count ? transitions[count - 1].exitTime : 0;
    if (time >= maxExitTime) {
      transitions.push(transition);
    } else {
      let index = count;
      while (--index >= 0 && time < transitions[index].exitTime);
      transitions.splice(index + 1, 0, transition);
    }
  }
}
