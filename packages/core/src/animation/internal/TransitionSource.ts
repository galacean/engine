import { AnimatorState } from "../AnimatorState";
import { AnimatorStateTransition } from "../AnimatorStateTransition";

/**
 * @internal
 */
export abstract class TransitionSource {
  abstract _updateTransitionsIndex(transition: AnimatorStateTransition, hasExitTime?: boolean): void;
  abstract _updateSoloTransition(transition: AnimatorStateTransition, hasSolo?: boolean): void;

  protected _addTransition(
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
    transition._source = this;

    if (transition.hasExitTime) {
      this._addHasExitTimeTransition(transition, transitions);
    } else {
      transitions.unshift(transition);
    }
    return transition;
  }

  protected _removeTransition(transition: AnimatorStateTransition, transitions: AnimatorStateTransition[]): void {
    const index = transitions.indexOf(transition);
    index !== -1 && transitions.splice(index, 1);
    transition._source = null;
  }

  protected _addHasExitTimeTransition(
    transition: AnimatorStateTransition,
    transitions: AnimatorStateTransition[]
  ): void {
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
