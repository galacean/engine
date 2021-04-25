import { Entity } from "../Entity";
import { AnimatorState } from "./AnimatorState";
import { AnimatorStateTransition } from "./AnimatorTransition";

export interface AnimatorStateMap {
  [key: string]: AnimatorState;
}

/**
 * A graph controlling the interaction of states. Each state references a motion.
 */
export class AnimatorStateMachine {
  /** The list of states. */
  states: AnimatorState[] = [];
  /** The list of transitions in the state machine. */
  transitions: AnimatorStateTransition[] = [];

  /** @internal */
  _statesMap: AnimatorStateMap = {};
  /** @internal */
  _target: Entity;

  /**
   * Add a state to the state machine.
   * @param name - The name of the new state
   */
  addState(name: string): AnimatorState {
    let state = this.findStateByName(name);
    if (!state) {
      state = new AnimatorState(name);
      if (this._target) {
        state._setTarget(this._target);
      }
      this.states.push(state);
      this._statesMap[name] = state;
    }
    return state;
  }

  /**
   * Remove a state from the state machine.
   * @param name - The state
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
  findStateByName(name: string) {
    return this._statesMap[name];
  }
  /** @internal */
  _setTarget(target: Entity): void {
    this._target = target;
    const layerCount = this.states.length;
    for (let i = layerCount - 1; i >= 0; i--) {
      this.states[i]._setTarget(target);
    }
  }
}
