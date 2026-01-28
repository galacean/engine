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
    const transitions = this.transitions;
    const index = transitions.indexOf(transition);
    if (index !== -1) {
      transitions.splice(index, 1);
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
    const transitions = this.transitions;
    for (let i = 0, n = transitions.length; i < n; i++) {
      const transition = transitions[i];
      transition._collection = null;
    }
    transitions.length = 0;
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

    // NoExitTime transitions are stored at the front of the array [0, noExitTimeCount)
    if (!transition.hasExitTime) {
      transitions.unshift(transition);
      this.noExitTimeCount++;
      return;
    }

    // HasExitTime transitions are sorted by exitTime in range [noExitTimeCount, count)
    const { exitTime } = transition;
    const { noExitTimeCount } = this;
    const count = transitions.length;
    // Only compare with hasExitTime transitions (after noExitTimeCount)
    const maxExitTime = count > noExitTimeCount ? transitions[count - 1].exitTime : 0;
    if (exitTime >= maxExitTime) {
      transitions.push(transition);
    } else {
      let index = count;
      // Stop at noExitTimeCount boundary to avoid comparing with noExitTime transitions
      while (--index >= noExitTimeCount && exitTime < transitions[index].exitTime);
      transitions.splice(index + 1, 0, transition);
    }
  }
}
