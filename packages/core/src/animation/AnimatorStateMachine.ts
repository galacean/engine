import { AnimatorState, WrapMode } from "./AnimatorState";
import { StateMachineBehaviour } from "./AnimatorController";
import { AnimatorStateTransition } from "./AnimatorTransition";

export class AnimatorStateMachine {
  name: string;
  states: AnimatorState[] = [];
  transitions: AnimatorStateTransition[] = [];
  speed: string | number;
  wrapMode: WrapMode;
  entryState: AnimatorState;
  anyState: AnimatorState;
  exitState: AnimatorState;
  effectiveState: AnimatorState;

  _update(deltaTime) {
    for (let i = this.states.length - 1; i >= 0; i--) {
      const animatorState = this.states[i];
      animatorState._update(deltaTime);
    }
  }

  addState(name: string) {
    const state = AnimatorState.findStateByName(name);
    this.states.push(state);
    console.log("addState", this.states);
  }
  removeState(state: AnimatorState) {}
  findStateByName(name: string) {}
  addStateMachineBehaviour(behaviour: StateMachineBehaviour) {}
  removeStateMachineBehaviour(index: number) {}
  mkeUniqueStateName(name: string) {}
}
