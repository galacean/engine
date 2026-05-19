import { AnimationClip } from "./AnimationClip";
import { AnimatorState } from "./AnimatorState";
import { AnimatorStatePlayData } from "./internal/AnimatorStatePlayData";
import { WrapMode } from "./enums/WrapMode";

/**
 * Per-Animator view of an `AnimatorState`.
 *
 * Override fields (speed, wrapMode) are scoped to this Animator; unset fields
 * fall through to the underlying state asset.
 */
export class AnimatorStateInstance {
  /** @internal */
  readonly _state: AnimatorState;
  /** @internal */
  readonly _playData: AnimatorStatePlayData;

  private _speed: number | undefined;
  private _wrapMode: WrapMode | undefined;

  /**
   * The name of the underlying state.
   */
  get name(): string {
    return this._state.name;
  }

  /**
   * The animation clip of the underlying state.
   */
  get clip(): AnimationClip {
    return this._state.clip;
  }

  /**
   * The normalized clip start time of the underlying state.
   */
  get clipStartTime(): number {
    return this._state.clipStartTime;
  }

  /**
   * The normalized clip end time of the underlying state.
   */
  get clipEndTime(): number {
    return this._state.clipEndTime;
  }

  /**
   * Playback speed for this Animator; overrides the underlying state when set.
   */
  get speed(): number {
    return this._speed ?? this._state.speed;
  }

  set speed(value: number) {
    this._speed = value;
  }

  /**
   * Wrap mode for this Animator; overrides the underlying state when set.
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
