import { AnimatorState } from "./AnimatorState";
import { AnimatorTransition } from "./AnimatorTransition";

/**
 * A graph controlling the interaction of states. Each state references a motion.
 */
export class AnimatorStateMachine {
  /** The list of states. */
  readonly states: AnimatorState[] = [];
  readonly stateMachines: AnimatorStateMachine[] = [];
  declare readonly name: string;

  /**
   * The transitions that are going out of the state machine.
   */
  get transitions(): Readonly<AnimatorTransition[]> {
    return this._transitions;
  }

  /**
   * The state will be played automatically.
   * @remarks When the Animator's AnimatorController changed or the Animator's onEnable be triggered.
   */
  defaultState: AnimatorState;

  entryState: AnimatorState;
  anyState: AnimatorState;
  exitState: AnimatorState;

  /** @internal */
  _statesMap: Record<string, AnimatorState> = {};
  /** @internal */
  _stateMachinesMap: Record<string, AnimatorStateMachine> = {};

  private _transitions: AnimatorTransition[] = [];

  /**
   * @param name - The name of the state machine
   */
  constructor(name?: string) {
    this.name = name || this.makeUniqueStateMachineName("New State Machine");
    this.entryState = this.addState("Entry");
    this.anyState = this.addState("AnyState");
    this.exitState = this.addState("Exit");
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
   * Add a state machine to the state machine.
   * @param name - The name of the new state
   */
  addStateMachine(name: string): AnimatorStateMachine {
    let stateMachine = this.findStateMachineByName(name);
    if (!stateMachine) {
      stateMachine = new AnimatorStateMachine(name);
      this.stateMachines.push(stateMachine);
      this._stateMachinesMap[name] = stateMachine;
    } else {
      console.warn(`The state machine named ${name} has existed.`);
    }
    return stateMachine;
  }

  /**
   * Remove a state machine from the state machine.
   * @param stateMachine - The state machine
   */
  removeStateMachine(stateMachine: AnimatorStateMachine): void {
    const { name } = stateMachine;
    const index = this.stateMachines.indexOf(stateMachine);
    if (index > -1) {
      this.stateMachines.splice(index, 1);
    }
    delete this._stateMachinesMap[name];
  }

  /**
   * Get the state machine by name.
   * @param name - The state machine's name
   */
  findStateMachineByName(name: string): AnimatorStateMachine {
    return this._stateMachinesMap[name];
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
   * Makes a unique state machine name in the state machine.
   * @param name - Desired name for the state machine.
   * @returns Unique name.
   */
  makeUniqueStateMachineName(name: string): string {
    const { _stateMachinesMap } = this;
    const originName = name;
    let index = 0;
    while (_stateMachinesMap[name]) {
      name = `${originName} ${index}`;
      index++;
    }
    return name;
  }

  /**
   * Add an outgoing transition from the source state machine to the destination.
   * @param transition - The transition
   */
  addTransition(transition: AnimatorTransition): void {
    this._transitions.push(transition);
  }

  /**
   * Remove a transition from the state machine.
   * @param transition - The transition
   */
  removeTransition(transition: AnimatorTransition): void {
    const index = this._transitions.indexOf(transition);
    index !== -1 && this._transitions.splice(index, 1);
  }

  /**
   * Clears all transitions from the state machine.
   */
  clearTransitions(): void {
    this._transitions.length = 0;
  }

  /**
   * The duration of the state machine.
   */
  getDuration() {
    const { defaultState } = this;
    let duration = 0;
    let offset = 0;
    let start: AnimatorState | AnimatorStateMachine = defaultState;

    if (!start) {
      return 0;
    }

    while (true) {
      const transition = start.transitions[0];
      if (start instanceof AnimatorState) {
        let extraTime = 0;
        const dur = start.getDuration();
        if (transition && transition._hasDestination()) {
          extraTime = dur * (1 - transition.exitTime);
        }
        const offsetTime = dur * offset;
        duration += dur - offsetTime - extraTime;
      } else {
        duration += start.getDuration();
      }

      if (transition?.destinationState) {
        start = transition.destinationState;
        offset = transition.offset ?? 0;
      } else if (transition?.destinationStateMachine) {
        start = transition.destinationStateMachine;
        offset = transition.offset ?? 0;
      } else {
        break;
      }
    }
    return duration;
  }
}
