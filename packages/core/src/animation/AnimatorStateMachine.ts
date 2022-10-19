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

  /**
   * The state will be played automatically.
   * @remarks When the Animator's AnimatorController changed or the Animator's onEnable be triggered.
   */
  defaultState: AnimatorState;

  /** @internal */
  _statesMap: AnimatorStateMap = {};

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
}
