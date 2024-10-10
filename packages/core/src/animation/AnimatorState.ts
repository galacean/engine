import { UpdateFlagManager } from "../UpdateFlagManager";
import { AnimationClip } from "./AnimationClip";
import { AnimatorStateTransition } from "./AnimatorStateTransition";
import { AnimatorStateTransitionCollection } from "./AnimatorStateTransitionCollection";
import { WrapMode } from "./enums/WrapMode";
import { StateMachineScript } from "./StateMachineScript";

/**
 * States are the basic building blocks of a state machine. Each state contains a AnimationClip which will play while the character is in that state.
 */
export class AnimatorState {
  /** The speed of the clip. 1 is normal speed, default 1. */
  speed: number = 1.0;
  /** The wrap mode used in the state. */
  wrapMode: WrapMode = WrapMode.Loop;

  /** @internal */
  _onStateEnterScripts: StateMachineScript[] = [];
  /** @internal */
  _onStateUpdateScripts: StateMachineScript[] = [];
  /** @internal */
  _onStateExitScripts: StateMachineScript[] = [];
  /** @internal */
  _updateFlagManager: UpdateFlagManager = new UpdateFlagManager();
  /** @internal */
  _transitionCollection: AnimatorStateTransitionCollection = new AnimatorStateTransitionCollection();

  private _clipStartTime: number = 0;
  private _clipEndTime: number = 1;
  private _clip: AnimationClip;

  /**
   * The transitions that are going out of the state.
   */
  get transitions(): Readonly<AnimatorStateTransition[]> {
    return this._transitionCollection._transitions;
  }

  /**
   * The clip that is being played by this animator state.
   */
  get clip(): AnimationClip {
    return this._clip;
  }

  set clip(clip: AnimationClip) {
    const lastClip = this._clip;
    if (lastClip === clip) {
      return;
    }

    if (lastClip) {
      lastClip._updateFlagManager.removeListener(this._onClipChanged);
    }

    this._clip = clip;
    this._clipEndTime = Math.min(this._clipEndTime, 1);

    this._onClipChanged();

    clip && clip._updateFlagManager.addListener(this._onClipChanged);
  }

  /**
   * The normalized start time of the clip, the range is 0 to 1, default is 0.
   */
  get clipStartTime() {
    return this._clipStartTime;
  }

  set clipStartTime(time: number) {
    this._clipStartTime = Math.max(time, 0);
  }

  /**
   * The normalized end time of the clip, the range is 0 to 1, default is 1.
   */
  get clipEndTime() {
    return this._clipEndTime;
  }

  set clipEndTime(time: number) {
    this._clipEndTime = Math.min(time, 1);
  }

  /**
   * The fixed start time of the clip, the range is 0 to clip.length, default is 0.
   */
  get clipStartFixedTime() {
    return this._clipStartTime * this.clip.length;
  }

  /**
   * The fixed end time of the clip, the range is 0 to clip.length, default is clip.length.
   */
  get clipEndFixedTime() {
    return this._clipEndTime * this.clip.length;
  }

  /**
   * @param name - The state's name
   */
  constructor(public readonly name: string) {
    this._onClipChanged = this._onClipChanged.bind(this);
  }

  /**
   * Add an outgoing transition.
   * @param transition - The transition
   */
  addTransition(transition: AnimatorStateTransition): AnimatorStateTransition;
  /**
   * Add an outgoing transition to the destination state.
   * @param animatorState - The destination state
   */
  addTransition(animatorState: AnimatorState): AnimatorStateTransition;

  addTransition(transitionOrAnimatorState: AnimatorStateTransition | AnimatorState): AnimatorStateTransition {
    return this._transitionCollection.add(transitionOrAnimatorState);
  }

  /**
   * Add an outgoing transition to exit of the stateMachine.
   * @param exitTime - The time at which the transition can take effect. This is represented in normalized time.
   */
  addExitTransition(exitTime: number = 1.0): AnimatorStateTransition {
    const transition = new AnimatorStateTransition();
    transition._isExit = true;
    transition.exitTime = exitTime;

    return this._transitionCollection.add(transition);
  }
  /**
   * Remove a transition from the state.
   * @param transition - The transition
   */
  removeTransition(transition: AnimatorStateTransition): void {
    this._transitionCollection.remove(transition);
    if (transition._isExit) {
      transition._isExit = false;
    }
  }

  /**
   * Adds a state machine script class of type T to the AnimatorState.
   * @param scriptType - The state machine script class of type T
   */
  addStateMachineScript<T extends StateMachineScript>(scriptType: new () => T): T {
    const script = new scriptType();
    script._state = this;

    const { prototype } = StateMachineScript;
    if (script.onStateEnter !== prototype.onStateEnter) {
      this._onStateEnterScripts.push(script);
    }
    if (script.onStateUpdate !== prototype.onStateUpdate) {
      this._onStateUpdateScripts.push(script);
    }
    if (script.onStateExit !== prototype.onStateExit) {
      this._onStateExitScripts.push(script);
    }

    return script;
  }

  /**
   * Clears all transitions from the state.
   */
  clearTransitions(): void {
    this._transitionCollection.count = 0;
  }

  /**
   * @internal
   */
  _getDuration(): number {
    if (this.clip) {
      return (this._clipEndTime - this._clipStartTime) * this.clip.length;
    }
    return null;
  }

  /**
   * @internal
   */
  _removeStateMachineScript(script: StateMachineScript): void {
    const { prototype } = StateMachineScript;
    if (script.onStateEnter !== prototype.onStateEnter) {
      const index = this._onStateEnterScripts.indexOf(script);
      index !== -1 && this._onStateEnterScripts.splice(index, 1);
    }
    if (script.onStateUpdate !== prototype.onStateUpdate) {
      const index = this._onStateUpdateScripts.indexOf(script);
      index !== -1 && this._onStateUpdateScripts.splice(index, 1);
    }
    if (script.onStateExit !== prototype.onStateExit) {
      const index = this._onStateExitScripts.indexOf(script);
      index !== -1 && this._onStateExitScripts.splice(index, 1);
    }
  }

  /**
   * @internal
   */
  _onClipChanged(): void {
    this._updateFlagManager.dispatch();
  }
}
