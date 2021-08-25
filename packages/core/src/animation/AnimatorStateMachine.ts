import { AnimatorState } from "./AnimatorState";
export interface AnimatorStateMap {
  [key: string]: AnimatorState;
}

/**
 * A graph controlling the interaction of states. Each state references a motion.
 */
export class AnimatorStateMachine {
  /** The list of states. */
  readonly states: AnimatorState[] = [];

  /** @internal */
  _statesMap: AnimatorStateMap = {};

  private _stateNameIndex: Record<string, number> = {};

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
    delete this._stateNameIndex[name];
  }

  /**
   * Get the state by name.
   * @param name - The layer's name
   */
  findStateByName(name: string): AnimatorState {
    return this._statesMap[name];
  }

  /**
   * Makes a unique state name in the context of the parent state machine.
   * @param name - Desired name for the state.
   */
  makeUniqueStateName(name: string) {
    const { _statesMap, _stateNameIndex } = this;
    console.log(_statesMap, _stateNameIndex);
    while (_statesMap[name]) {
      _stateNameIndex[name] = _stateNameIndex[name] ?? 0;
      const index = ++_stateNameIndex[name];
      name = `${name}_${index}`;
    }
    return name;
  }
}
