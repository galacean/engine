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

  needReset = true;

  private _soloCount = 0;
  private _currentTransitionIndex = 0;

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
    this.needReset = false;
  }

  forwardCheck(
    animator: Animator,
    state: AnimatorState,
    lastClipTime: number,
    curClipTime: number
  ): AnimatorStateTransition {
    if (this.needReset) this.resetTransitionIndex(true);

    const { _transitions: transitions } = this;
    let transitionIndex = this._currentTransitionIndex;
    for (let n = transitions.length; transitionIndex < n; transitionIndex++) {
      const transition = transitions[transitionIndex];
      const hasExitTime = transition.hasExitTime;
      const exitTime = transition.exitTime * state.clipEndFixedTime;

      if (hasExitTime && exitTime > curClipTime) {
        break;
      }

      if (hasExitTime && exitTime < lastClipTime) continue;

      this._currentTransitionIndex = Math.min(transitionIndex + 1, n - 1);

      if (transition.mute || (this.isSoloMode && !transition.solo) || !this.checkConditions(animator, transition)) {
        continue;
      }

      return transition;
    }
    return null;
  }

  backwardCheck(
    animator: Animator,
    state: AnimatorState,
    lastClipTime: number,
    curClipTime: number
  ): AnimatorStateTransition {
    if (this.needReset) this.resetTransitionIndex(false);

    const { _transitions: transitions } = this;
    let transitionIndex = this._currentTransitionIndex;
    for (let n = transitions.length; transitionIndex >= this._noExitTimeCount; transitionIndex--) {
      const transition = transitions[transitionIndex];
      const hasExitTime = transition.hasExitTime;
      const exitTime = transition.exitTime * state.clipEndFixedTime;

      if (hasExitTime && exitTime < curClipTime) {
        break;
      }

      if (hasExitTime && exitTime > lastClipTime) continue;

      this._currentTransitionIndex = Math.max(transitionIndex - 1, 0);

      if (transition.mute || (this.isSoloMode && !transition.solo) || !this.checkConditions(animator, transition)) {
        continue;
      }
    }
    return null;
  }

  checkNoExitTimeTransition(animator: Animator): AnimatorStateTransition {
    for (let i = 0; i < this._noExitTimeCount; ++i) {
      const transition = this._transitions[i];
      if (transition.mute || (this.isSoloMode && !transition.solo) || !this.checkConditions(animator, transition)) {
        continue;
      }

      return transition;
    }
    return null;
  }

  checkTransitionByCondition(animator: Animator): AnimatorStateTransition {
    for (let i = 0, n = this.count; i < n; i++) {
      const transition = this.get(i);

      if (transition.mute || (this.isSoloMode && !transition.solo) || !this.checkConditions(animator, transition))
        continue;

      return transition;
    }
  }

  checkConditions(animator: Animator, transition: AnimatorStateTransition): boolean {
    const { conditions } = transition;
    let allPass = true;
    for (let i = 0, n = conditions.length; i < n; ++i) {
      let pass = false;
      const { mode, parameterName: name, threshold } = conditions[i];
      const parameterValue = animator.getParameterValue(name);

      if (parameterValue === undefined) {
        return false;
      }

      if (parameterValue === true) {
        const parameter = animator.getParameter(name);
        if (parameter?._isTrigger) {
          Animator._passedTriggerParameterNames.push(name);
          pass = true;
        }
      }

      if (!pass) {
        switch (mode) {
          case AnimatorConditionMode.Equals:
            if (parameterValue === threshold) {
              pass = true;
            }
            break;
          case AnimatorConditionMode.Greater:
            if (parameterValue > threshold) {
              pass = true;
            }
            break;
          case AnimatorConditionMode.Less:
            if (parameterValue < threshold) {
              pass = true;
            }
            break;
          case AnimatorConditionMode.NotEquals:
            if (parameterValue !== threshold) {
              pass = true;
            }
            break;
          case AnimatorConditionMode.If:
            if (parameterValue === true) {
              pass = true;
            }
            break;
          case AnimatorConditionMode.IfNot:
            if (parameterValue === false) {
              pass = true;
            }
            break;
        }
      }

      if (!pass) {
        allPass = false;
        break;
      }
    }

    if (allPass) {
      animator._deactivateTriggeredParameters();
    }

    Animator._passedTriggerParameterNames.length = 0;

    return allPass;
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
