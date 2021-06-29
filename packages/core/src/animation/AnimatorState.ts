import { AnimationClip } from "./AnimationClip";
import { AnimatorStateTransition } from "./AnimatorTransition";
import { WrapMode } from "./enums/WrapMode";

/**
 * States are the basic building blocks of a state machine. Each state contains a AnimationClip which will play while the character is in that state.
 */
export class AnimatorState {
  /** The speed of the clip. 1 is normal speed, default 1. */
  speed: number = 1.0;
  /** The wrap mode used in the state. */
  wrapMode: WrapMode = WrapMode.Loop;

  private _clipStartTime: number = 0;
  private _clipEndTime: number = Infinity;
  private _clip: AnimationClip;
  private _transitions: AnimatorStateTransition[] = [];

  /**
   * The transitions that are going out of the state.
   */
  get transitions(): Readonly<AnimatorStateTransition[]> {
    return this._transitions;
  }

  /**
   * ƒThe clip that is being played by this animator state.
   */
  get clip(): AnimationClip {
    return this._clip;
  }

  set clip(clip: AnimationClip) {
    this._clip = clip;
    this._clipEndTime = Math.min(this._clipEndTime, clip.length);
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

  set clipEndTime(time: number) {
    const clip = this._clip;
    if (clip) {
      this._clipEndTime = Math.min(time, clip.length);
    }
  }

  /**
   * @param name - The state's name
   */
  constructor(public readonly name: string) {}

  /**
   * Add an outgoing transition to the destination state.
   * @param transition - The transition
   */
  addTransition(transition: AnimatorStateTransition): void {
    this._transitions.push(transition);
  }

  /**
   * Remove a transition from the state.
   * @param transition - The transition
   */
  removeTransition(transition: AnimatorStateTransition): void {
    const index = this._transitions.indexOf(transition);
    index !== -1 && this._transitions.splice(index, 1);
  }

  /**
   * Clears all transitions from the state.
   */
  clearTransitions(): void {
    this._transitions.length = 0;
  }

  /**
   * @internal
   */
  _getDuration(): number {
    return this._clipEndTime - this._clipStartTime;
  }
}
