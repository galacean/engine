import { AnimatorState } from "./AnimatorState";
import { AnimatorStateTransition } from "./AnimatorStateTransition";
import { TransitionSource } from "./internal/TransitionSource";
export interface AnimatorStateMap {
  [key: string]: AnimatorState;
}

/**
 * A graph controlling the interaction of states. Each state references a motion.
 */
export class AnimatorStateMachine extends TransitionSource {
  /** The list of states. */
  readonly states: AnimatorState[] = [];

  /**
   * The state will be played automatically.
   * @remarks When the Animator's AnimatorController changed or the Animator's onEnable be triggered.
   */
  defaultState: AnimatorState;

  /** @internal */
  _entryHasSolo: boolean = false;

  /** @internal */
  _anyHasSolo: boolean = false;

  private _entryTransitions: AnimatorStateTransition[] = [];
  private _anyStateTransitions: AnimatorStateTransition[] = [];
  private _statesMap: AnimatorStateMap = {};

  /**
   * The list of entry transitions in the state machine.
   */
  get entryTransitions(): Readonly<AnimatorStateTransition[]> {
    return this._entryTransitions;
  }

  /**
   * The list of AnyState transitions.
   */
  get anyStateTransitions(): Readonly<AnimatorStateTransition[]> {
    return this._anyStateTransitions;
  }

  /**
   * Add a state to the state machine.
   * @param name - The name of the new state
   */
  addState(name: string): AnimatorState {
    let state = this.findStateByName(name);
    if (!state) {
      state = new AnimatorState(name);
      this.states.push(state);
      this._statesMap[name] = state;
    } else {
      console.warn(`The state named ${name} has existed.`);
    }
    return state;
  }

  /**
   * Remove a state from the state machine.
   * @param state - The state
   */
  removeState(state: AnimatorState): void {
    const { name } = state;
    const index = this.states.indexOf(state);
    if (index > -1) {
      this.states.splice(index, 1);
    }
    delete this._statesMap[name];
  }

  /**
   * Get the state by name.
   * @param name - The layer's name
   */
  findStateByName(name: string): AnimatorState {
    return this._statesMap[name];
  }

  /**
   * Makes a unique state name in the state machine.
   * @param name - Desired name for the state.
   * @returns Unique name.
   */
  makeUniqueStateName(name: string): string {
    const { _statesMap } = this;
    const originName = name;
    let index = 0;
    while (_statesMap[name]) {
      name = `${originName} ${index}`;
      index++;
    }
    return name;
  }

  /**
   * Add an entry transition.
   * @param transition - The transition
   */
  addEntryStateTransition(transition: AnimatorStateTransition): AnimatorStateTransition;
  /**
   * Add an entry transition to the destination state, the default value of entry transition's hasExitTime is false.
   * @param animatorState - The destination state
   */

  addEntryStateTransition(animatorState: AnimatorState): AnimatorStateTransition;

  addEntryStateTransition(transitionOrAnimatorState: AnimatorStateTransition | AnimatorState): AnimatorStateTransition {
    const transition = this._addTransition(transitionOrAnimatorState, this._entryTransitions);
    transition._isEntry = true;
    transition.solo && !this._entryHasSolo && this._updateSoloTransition(transition, true);
    return transition;
  }

  /**
   * Remove an entry transition.
   * @param transition - The transition
   */
  removeEntryStateTransition(transition: AnimatorStateTransition): void {
    this._removeTransition(transition, this._entryTransitions);
    transition._isEntry = false;
  }

  /**
   * Add an any transition.
   * @param transition - The transition
   */
  addAnyStateTransition(transition: AnimatorStateTransition): AnimatorStateTransition;
  /**
   * Add an any transition to the destination state, the default value of any transition's hasExitTime is false.
   * @param animatorState - The destination state
   */
  addAnyStateTransition(animatorState: AnimatorState): AnimatorStateTransition;

  addAnyStateTransition(transitionOrAnimatorState: AnimatorStateTransition | AnimatorState): AnimatorStateTransition {
    const transition = this._addTransition(transitionOrAnimatorState, this._anyStateTransitions);
    transition._isAny = true;
    transition.solo && !this._anyHasSolo && this._updateSoloTransition(transition, true);
    return transition;
  }

  /**
   * Remove an any transition.
   * @param transition - The transition
   */
  removeAnyStateTransition(transition: AnimatorStateTransition): void {
    this._removeTransition(transition, this._anyStateTransitions);
    transition._isAny = false;
  }

  /**
   * @internal
   */
  _updateTransitionsIndex(transition: AnimatorStateTransition, hasExitTime: boolean): void {
    const transitions = transition._isAny ? this._anyStateTransitions : this._entryTransitions;
    transitions.splice(transitions.indexOf(transition), 1);
    if (hasExitTime) {
      this._addHasExitTimeTransition(transition, transitions);
    } else {
      transitions.unshift(transition);
    }
  }

  /**
   * @internal
   */
  _updateSoloTransition(transition: AnimatorStateTransition, hasSolo?: boolean): void {
    const transitions = transition._isAny ? this._anyStateTransitions : this._entryTransitions;
    let solo = false;
    if (hasSolo !== undefined) {
      solo = hasSolo;
    } else {
      for (let i = 0, n = transitions.length; i < n; ++i) {
        if (transitions[i].solo) {
          solo = true;
          break;
        }
      }
    }
    if (transition._isAny) {
      this._anyHasSolo = hasSolo;
    } else {
      this._entryHasSolo = hasSolo;
    }
  }
}
