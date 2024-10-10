import { AnimatorState } from "./AnimatorState";
import { AnimatorStateTransition } from "./AnimatorStateTransition";

/**
 * @internal
 */
export class AnimatorStateTransitionCollection {
  /** @internal */
  _transitions = new Array<AnimatorStateTransition>();
  _hasExitTimeTransitions = new Array<AnimatorStateTransition>();
  _noExitTimeTransitions = new Array<AnimatorStateTransition>();

  private _soloCount = 0;

  get isSoloMode(): boolean {
    return this._soloCount > 0;
  }

  get count(): number {
    return this._transitions.length;
  }

  get(index: number): AnimatorStateTransition {
    return this._transitions[index];
  }

  add(transitionOrAnimatorState: AnimatorStateTransition | AnimatorState): AnimatorStateTransition {
    let transition: AnimatorStateTransition;
    if (transitionOrAnimatorState instanceof AnimatorState) {
      transition = new AnimatorStateTransition();
      transition.hasExitTime = false;
      transition.destinationState = transitionOrAnimatorState;
    } else {
      transition = transitionOrAnimatorState;
    }

    if (transition.hasExitTime) {
      this._addHasExitTimeTransition(transition);
    } else {
      this._addNoExitTimeTransition(transition);
    }

    transition._collection = this;
    if (transition.solo) {
      this._soloCount++;
    }
    return transition;
  }

  remove(transition: AnimatorStateTransition): void {
    const index = this._transitions.indexOf(transition);
    index !== -1 && this._transitions.splice(index, 1);

    if (transition.hasExitTime) {
      this._hasExitTimeTransitions.splice(this._hasExitTimeTransitions.indexOf(transition), 1);
    } else {
      this._noExitTimeTransitions.splice(this._noExitTimeTransitions.indexOf(transition), 1);
    }

    transition._collection = null;
    if (transition.solo) {
      this._soloCount--;
    }
  }

  clear(): void {
    for (let i = 0, n = this._transitions.length; i < n; i++) {
      const transition = this._transitions[i];
      transition._collection = null;
    }
    this._transitions.length = 0;
    this._hasExitTimeTransitions.length = 0;
    this._noExitTimeTransitions.length = 0;
    this._soloCount = 0;
  }

  updateTransitionSolo(isModifiedSolo: boolean): void {
    this._soloCount += isModifiedSolo ? 1 : -1;
  }

  updateTransitionsIndex(transition: AnimatorStateTransition, hasExitTime: boolean): void {
    const transitions = this._transitions;
    transitions.splice(transitions.indexOf(transition), 1);
    if (hasExitTime) {
      this._noExitTimeTransitions.splice(this._noExitTimeTransitions.indexOf(transition), 1);
      this._addHasExitTimeTransition(transition);
    } else {
      this._hasExitTimeTransitions.splice(this._hasExitTimeTransitions.indexOf(transition), 1);
      this._addNoExitTimeTransition(transition);
    }
  }

  private _addHasExitTimeTransition(transition: AnimatorStateTransition): void {
    const transitions = this._transitions;
    const { exitTime } = transition;
    const count = transitions.length;
    const maxExitTime = count ? transitions[count - 1].exitTime : 0;
    if (exitTime >= maxExitTime) {
      transitions.push(transition);
    } else {
      let index = count;
      while (--index >= 0 && exitTime < transitions[index].exitTime);
      transitions.splice(index + 1, 0, transition);
    }
    this._hasExitTimeTransitions.push(transition);
  }

  private _addNoExitTimeTransition(transition: AnimatorStateTransition): void {
    this._noExitTimeTransitions.push(transition);
    this._transitions.unshift(transition);
  }
}
