import { Animator } from "./Animator";
import { AnimatorState } from "./AnimatorState";
import { AnimatorStateTransition } from "./AnimatorStateTransition";
import { AnimatorConditionMode } from "./enums/AnimatorConditionMode";

/**
 * @internal
 */
export class AnimatorStateTransitionCollection {
  /** @internal */
  _transitions = new Array<AnimatorStateTransition>();
  /** @internal */
  _noExitTimeCount = 0;
  /** @internal */
  _needReset = true;
  /** @internal */
  _currentTransitionIndex = 0;

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
    if (index !== -1) {
      this._transitions.splice(index, 1);
      if (!transition.hasExitTime) {
        this._noExitTimeCount--;
      }
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
    this._soloCount = 0;
    this._noExitTimeCount = 0;
  }

  updateTransitionSolo(isModifiedSolo: boolean): void {
    this._soloCount += isModifiedSolo ? 1 : -1;
  }

  updateTransitionsIndex(transition: AnimatorStateTransition, hasExitTime: boolean): void {
    const transitions = this._transitions;
    transitions.splice(transitions.indexOf(transition), 1);
    if (hasExitTime) {
      this._addHasExitTimeTransition(transition);
    } else {
      this._addNoExitTimeTransition(transition);
    }
  }

  resetTransitionIndex(isForwards: boolean): void {
    this._currentTransitionIndex = isForwards ? this._noExitTimeCount : this.count - 1;
    this._needReset = false;
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
  }

  private _addNoExitTimeTransition(transition: AnimatorStateTransition): void {
    this._transitions.unshift(transition);
    this._noExitTimeCount++;
  }
}
