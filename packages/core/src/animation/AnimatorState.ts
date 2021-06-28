import { AnimationClip } from "./AnimationClip";
import { Entity } from "../Entity";
import { AnimatorStateTransition } from "./AnimatorTransition";
import { WrapMode } from "./enums/WrapMode";
import { AnimatorStatePlayData } from "./internal/AnimatorStatePlayData";

/**
 * States are the basic building blocks of a state machine. Each state contains a AnimationClip which will play while the character is in that state.
 */
export class AnimatorState {
  /** The transitions that are going out of the state. */
  transitions: AnimatorStateTransition[] = [];
  /** The speed of the clip. 1 is normal speed, default 1. */
  speed: number = 1.0;
  /** The wrap mode used in the state. */
  wrapMode: WrapMode = WrapMode.Loop;

  /** Start time of the animation clip, default 0. */
  private _clipStartTime: number = 0;
  /** End time of the animation clip, If has the clip, the default value is clip.length otherwise it is Infinity. */
  private _clipEndTime: number = Infinity;
  /** The AnimationClip. */
  private _clip: AnimationClip;

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
    this._clip = clip;
    if (clip.length < this.clipEndTime) {
      this.clipEndTime = clip.length;
    }
  }

  /**
   * The clip start time the user setted , default is 0.
   */
  get clipStartTime() {
    return this._clipStartTime;
  }

  set clipStartTime(time: number) {
    this._clipStartTime = time < 0 ? 0 : time;
  }

  /**
   * The clip end time the user setted , default is the clip duration.
   */
  get clipEndTime() {
    return this._clipEndTime;
  }

  /**
   * Set the clip starttime, the animation clip will end at this time.
   */
  set clipEndTime(time: number) {
    const clipLength = this._clip.length;
    this._clipEndTime = time > this._clip.length ? clipLength : time;
  }

  /**
   * @param name - The state's name
   */
  constructor(public readonly name: string) {}

  /**
   * Add an outgoing transition to the destination state.
   * @param destinationState - The destination state
   */
  addTransition(destinationState: AnimatorState): AnimatorStateTransition {
    const transition = new AnimatorStateTransition();
    transition.destinationState = destinationState;
    this.transitions.push(transition);
    return transition;
  }

  /**
   * Remove a transition from the state.
   * @param transition - The transition
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

  /**
   * @internal
   */
  _setTarget(target: Entity): void {
    if (this.clip) {
      this.clip._setTarget(target);
    }
  }

  /**
   * @internal
   */
  _getDuration(): number {
    return this._clipEndTime - this._clipStartTime;
  }
}
