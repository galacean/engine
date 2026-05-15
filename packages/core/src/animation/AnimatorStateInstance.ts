import { AnimationClip } from "./AnimationClip";
import { AnimatorState } from "./AnimatorState";
import { AnimatorStatePlayData } from "./internal/AnimatorStatePlayData";
import { WrapMode } from "./enums/WrapMode";

/**
 * Per-Animator view of an `AnimatorState`.
 *
 * The state asset is shared across every Animator that references the same controller;
 * this view is created lazily per (Animator, state) pair and lets a single Animator
 * override playback fields (e.g. speed, wrapMode) without affecting other Animators
 * sharing the same controller. Unset fields fall through to the underlying state asset.
 */
export class AnimatorStateInstance {
  /** @internal */
  readonly _state: AnimatorState;
  /** @internal */
  readonly _playData: AnimatorStatePlayData;

  private _speed: number | undefined;
  private _wrapMode: WrapMode | undefined;

  /**
   * Name of the underlying state.
   */
  get name(): string {
    return this._state.name;
  }

  /**
   * Animation clip of the underlying state.
   */
  get clip(): AnimationClip {
    return this._state.clip;
  }

  /**
   * Normalized clip start time of the underlying state.
   */
  get clipStartTime(): number {
    return this._state.clipStartTime;
  }

  /**
   * Normalized clip end time of the underlying state.
   */
  get clipEndTime(): number {
    return this._state.clipEndTime;
  }

  /**
   * Playback speed for this Animator.
   *
   * Reading returns the per-instance override if set, otherwise the underlying state's speed.
   * Writing sets the override on this instance only; other Animators sharing the controller are unaffected.
   */
  get speed(): number {
    return this._speed ?? this._state.speed;
  }

  set speed(value: number) {
    this._speed = value;
  }

  /**
   * Wrap mode for this Animator.
   *
   * Reading returns the per-instance override if set, otherwise the underlying state's wrapMode.
   * Writing sets the override on this instance only; other Animators sharing the controller are unaffected.
   */
  get wrapMode(): WrapMode {
    return this._wrapMode ?? this._state.wrapMode;
  }

  set wrapMode(value: WrapMode) {
    this._wrapMode = value;
  }

  /** @internal */
  constructor(state: AnimatorState) {
    this._state = state;
    this._playData = new AnimatorStatePlayData(this);
  }
}
