import { Entity } from "./../Entity";
import { AnimatorState } from "./AnimatorState";
import { StateMachineBehaviour } from "./AnimatorController";
import { AnimatorStateTransition } from "./AnimatorTransition";
import { WrapMode } from "./AnimatorConst";

export class AnimatorStateMachine {
  name: string;
  states: AnimatorState[] = [];
  transitions: AnimatorStateTransition[] = [];
  speed: string | number;
  wrapMode: WrapMode = WrapMode.LOOP;
  entryState: AnimatorState;
  anyState: AnimatorState;
  exitState: AnimatorState;
  effectiveState: AnimatorState;
  /** @internal */
  _target: Entity;
  /**
   * @internal
   */
  set target(target: Entity) {
    this._target = target;
    const layerCount = this.states.length;
    for (let i = layerCount - 1; i >= 0; i--) {
      this.states[i].target = target;
    }
  }

  addState(name: string) {
    const state = AnimatorState.findStateByName(name);
    if (this._target) {
      state.target = this._target;
    }
    this.states.push(state);
  }

  removeState(state: AnimatorState) {
    this.states.splice(this.states.indexOf(state), 1);
    state.destroy();
  }

  addStateMachineBehaviour(behaviour: StateMachineBehaviour) {}
  removeStateMachineBehaviour(index: number) {}
  mkeUniqueStateName(name: string) {}
}
