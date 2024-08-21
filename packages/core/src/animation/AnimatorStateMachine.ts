import { AnimatorState } from "./AnimatorState";
import { AnimatorStateTransition } from "./AnimatorStateTransition";
export interface AnimatorStateMap {
  [key: string]: AnimatorState;
}

/**
 * A graph controlling the interaction of states. Each state references a motion.
 */
export class AnimatorStateMachine {
  /** The list of states. */
  readonly states: AnimatorState[] = [];

  /**
   * The state will be played automatically.
   * @remarks When the Animator's AnimatorController changed or the Animator's onEnable be triggered.
   */
  defaultState: AnimatorState;

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
    return this._addTransition(transitionOrAnimatorState, this._entryTransitions);
  }

  /**
   * Remove an entry transition.
   * @param transition - The transition
   */
  removeEntryStateTransition(transition: AnimatorStateTransition): void {
    this._removeTransition(transition, this._entryTransitions);
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
    return this._addTransition(transitionOrAnimatorState, this._anyStateTransitions);
  }

  /**
   * Remove an any transition.
   * @param transition - The transition
   */
  removeAnyStateTransition(transition: AnimatorStateTransition): void {
    this._removeTransition(transition, this._anyStateTransitions);
  }

  /**
   * Clears all entry transitions from the state.
   */
  clearEntryTransitions(): void {
    this._entryTransitions.length = 0;
  }

  /**
   * Clears all any transitions from the state.
   */
  clearAnyStateTransitions(): void {
    this._anyStateTransitions.length = 0;
  }

  private _addTransition(
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
    transitions.push(transition);
    return transition;
  }

  private _removeTransition(transition: AnimatorStateTransition, transitions: AnimatorStateTransition[]): void {
    const index = transitions.indexOf(transition);
    index !== -1 && transitions.splice(index, 1);
  }
}
