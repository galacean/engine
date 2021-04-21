import { Entity } from "../Entity";
import { AnimatorState } from "./AnimatorState";
import { AnimatorStateTransition } from "./AnimatorTransition";

export class AnimatorStateMachine {
  /**
   * The list of states.
   */
  states: AnimatorState[] = [];
  /**
   * The list of transitions in the state machine.
   */
  transitions: AnimatorStateTransition[] = [];
  /**
   * TODO The entry state of the state machine.
   */
  entryState: AnimatorState;
  /**
   * TODO The any state of the state machine.
   */
  anyState: AnimatorState;
  /**
   * TODO The exit state of the state machine.
   */
  exitState: AnimatorState;

  /** @internal */
  _target: Entity;

  /**
   * Add a state to the state machine.
   * @param name The name of the new state.
   */
  addState(name: string): AnimatorState {
    let state = AnimatorState.findStateByName(name);
    if (!state) {
      state = new AnimatorState(name);
    }
    if (this._target) {
      state._setTarget(this._target);
    }
    this.states.push(state);
    return state;
  }

  /**
   * Remove a state from the state machine.
   * @param name The state.
   */
  removeState(state: AnimatorState): void {
    const index = this.states.indexOf(state);
    if (index > -1) {
      this.states.splice(index, 1);
    }
    state._destroy();
  }

  /**
   * @internal
   */
  _setTarget(target: Entity): void {
    this._target = target;
    const layerCount = this.states.length;
    for (let i = layerCount - 1; i >= 0; i--) {
      this.states[i]._setTarget(target);
    }
  }
}
