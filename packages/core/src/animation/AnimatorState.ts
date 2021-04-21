import { AnimationClip } from "./AnimationClip";
import { Entity } from "../Entity";
import { AnimatorStateTransition } from "./AnimatorTransition";
import { WrapMode } from "./enums/WrapMode";
import { PlayType } from "./enums/PlayType";
import { AnimatorStateType } from "./enums/AnimatorStateType";

export interface AnimatorStateMap {
  [key: string]: AnimatorState;
}

export class AnimatorState {
  /**
   * The name mapping of all states.
   */
  static statesMap: AnimatorStateMap = {};
  /**
   * Get the state by name.
   * @param name  The layer's name.
   */
  static findStateByName(name: string) {
    return AnimatorState.statesMap[name];
  }

  /**
   * The transitions that are going out of the state.
   */
  transitions: AnimatorStateTransition[] = [];
  /**
   * The speed of the clip. 1 is normal speed, default 1.
   */
  speed: number = 1;
  /**
   * The wrap mode used in the state.
   */
  wrapMode: WrapMode = WrapMode.LOOP;

  /**
   * Get the clip that is being played by this animator state.
   */
  get clip() {
    return this._clip;
  }

  /**
   * Set the clip that is being played by this animator state.
   */
  set clip(clip: AnimationClip) {
    if (this._target) {
      clip._setTarget(this._target);
    }
    this._clip = clip;
  }

  /**
   * Get the current time of the clip.
   */
  get frameTime() {
    return this._frameTime;
  }

  /**
   * Set the current time of the clip.
   */
  set frameTime(time: number) {
    const animClip = this.clip;
    this._frameTime = time;
    if (time > animClip.length) {
      if (this.wrapMode === WrapMode.LOOP) {
        this._frameTime = time % animClip.length;
      } else {
        this._frameTime = animClip.length;
      }
    }
  }

  /**
   * @internal
   */
  _frameTime: number = 0;
  /**
   * @internal
   */
  _playType: PlayType = PlayType.NotStart;
  /**
   * @internal
   */
  _type: AnimatorStateType;
  /**
   * @internal
   */
  _target: Entity;

  private _clip: AnimationClip;

  /**
   * @param name - The state's name.
   */
  constructor(public readonly name: string) {
    AnimatorState.statesMap[name] = this;
  }

  /**
   * Add an outgoing transition to the destination state.
   * @param destinationState The destination state.
   */
  addTransition(destinationState: AnimatorState) {
    const transition = new AnimatorStateTransition();
    transition.destinationState = destinationState;
    this.transitions.push(transition);
    return transition;
  }

  /**
   * Remove a transition from the state.
   * @param transition The transition.
   */
  removeTransition(transition: AnimatorStateTransition) {
    this.transitions.splice(this.transitions.indexOf(transition), 1);
  }

  /**
   * Clears all transitions from the state.
   */
  clearTransitions() {
    const length = this.transitions.length;
    for (let i = length - 1; i >= 0; i--) {
      this.transitions[i] = null;
    }
    this.transitions = [];
  }

  /**
   * @internal
   */
  _destroy() {
    delete AnimatorState.statesMap[this.name];
  }

  /**
   * @internal
   */
  _setTarget(target: Entity) {
    this._target = target;
    if (this.clip) {
      this.clip._setTarget(target);
    }
  }
}
