import { AnimationClip } from "./AnimationClip";
import { Entity } from "../Entity";
import { AnimatorStateTransition } from "./AnimatorTransition";
import { WrapMode } from "./enums/WrapMode";
import { PlayType } from "./enums/PlayType";
import { AnimatorStateType } from "./enums/AnimatorStateType";

export class AnimatorState {
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
   * Start time of the animation clip, default 0.
   */
  clipStartTime: number = 0;
  /**
   * End time of the animation clip, If has the clip, the default value is clip.length otherwise it is Infinity.
   */
  clipEndTime: number = Infinity;

  /**
   * Get the clip that is being played by this animator state.
   */
  get clip(): AnimationClip {
    return this._clip;
  }

  /**
   * Set the clip that is being played by this animator state.
   */
  set clip(clip: AnimationClip) {
    if (this._target) {
      clip._setTarget(this._target);
    }
    if (clip.length < this.clipEndTime) {
      this.clipEndTime = clip.length;
    }
    this._clip = clip;
  }

  /**
   * @internal
   * Get the current time of the clip.
   */
  get frameTime(): number {
    return this._frameTime;
  }

  /**
   * @internal
   * Set the current time of the clip.
   */
  set frameTime(time: number) {
    const animClip = this.clip;
    this._frameTime = time;
    const endTime = Math.min(this.clipEndTime, animClip.length);
    if (time > endTime) {
      if (this.wrapMode === WrapMode.LOOP) {
        this._frameTime = time % endTime;
      } else {
        this._frameTime = endTime;
      }
    }
  }

  /** @internal */
  _frameTime: number = 0;
  /** @internal */
  _playType: PlayType = PlayType.NotStart;
  /** @internal */
  _type: AnimatorStateType;
  /** @internal */
  _target: Entity;

  private _clip: AnimationClip;

  /**
   * @param name - The state's name.
   */
  constructor(public readonly name: string) {}

  /**
   * Add an outgoing transition to the destination state.
   * @param destinationState The destination state.
   */
  addTransition(destinationState: AnimatorState): AnimatorStateTransition {
    const transition = new AnimatorStateTransition();
    transition.destinationState = destinationState;
    this.transitions.push(transition);
    return transition;
  }

  /**
   * Remove a transition from the state.
   * @param transition The transition.
   */
  removeTransition(transition: AnimatorStateTransition): void {
    this.transitions.splice(this.transitions.indexOf(transition), 1);
  }

  /**
   * Clears all transitions from the state.
   */
  clearTransitions(): void {
    const length = this.transitions.length;
    for (let i = length - 1; i >= 0; i--) {
      this.transitions[i] = null;
    }
    this.transitions = [];
  }

  /** @internal */
  _setTarget(target: Entity) {
    this._target = target;
    if (this.clip) {
      this.clip._setTarget(target);
    }
  }

  /** @internal */
  _getTheRealFrameTime() {
    const { frameTime } = this;
    if (frameTime < this.clipStartTime) {
      return this.clipStartTime;
    } else if (frameTime > this.clipEndTime) {
      return this.clipEndTime;
    } else {
      return frameTime;
    }
  }
}
