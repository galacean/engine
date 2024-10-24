import { AnimatorState } from "./AnimatorState";
import { AnimatorStateTransition } from "./AnimatorStateTransition";

/**
 * @internal
 */
export class AnimatorStateTransitionCollection {
  transitions = new Array<AnimatorStateTransition>();
  noExitTimeCount = 0;
  needResetCurrentCheckIndex = true;
  currentCheckIndex: number;

  private _soloCount = 0;

  get isSoloMode(): boolean {
    return this._soloCount > 0;
  }

  get count(): number {
    return this.transitions.length;
  }

  get(index: number): AnimatorStateTransition {
    return this.transitions[index];
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

    this._addTransition(transition);

    transition._collection = this;
    if (transition.solo) {
      this._soloCount++;
    }
    return transition;
  }

  remove(transition: AnimatorStateTransition): void {
    const index = this.transitions.indexOf(transition);
    if (index !== -1) {
      this.transitions.splice(index, 1);
      if (!transition.hasExitTime) {
        this.noExitTimeCount--;
      }
    }

    transition._collection = null;
    if (transition.solo) {
      this._soloCount--;
    }
  }

  clear(): void {
    for (let i = 0, n = this.transitions.length; i < n; i++) {
      const transition = this.transitions[i];
      transition._collection = null;
    }
    this.transitions.length = 0;
    this._soloCount = 0;
    this.noExitTimeCount = 0;
  }

  updateTransitionSolo(isModifiedSolo: boolean): void {
    this._soloCount += isModifiedSolo ? 1 : -1;
  }

  updateTransitionsIndex(transition: AnimatorStateTransition, hasExitTime: boolean): void {
    const transitions = this.transitions;
    transitions.splice(transitions.indexOf(transition), 1);
    this._addTransition(transition);
  }

  updateCurrentCheckIndex(isForward: boolean): void {
    this.currentCheckIndex = isForward
      ? Math.min(this.currentCheckIndex + 1, this.count - this.noExitTimeCount - 1)
      : Math.max(this.currentCheckIndex - 1, 0);
  }

  resetCurrentCheckIndex(isForward: boolean): void {
    this.currentCheckIndex = isForward ? 0 : this.count - this.noExitTimeCount - 1;
    this.needResetCurrentCheckIndex = false;
  }

  private _addTransition(transition: AnimatorStateTransition): void {
    const transitions = this.transitions;

    if (!transition.hasExitTime) {
      transitions.unshift(transition);
      this.noExitTimeCount++;
      return;
    }

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
}
