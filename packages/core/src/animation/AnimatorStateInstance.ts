import { AnimationClip } from "./AnimationClip";
import { AnimatorState } from "./AnimatorState";
import { AnimatorStatePlayData } from "./internal/AnimatorStatePlayData";
import { WrapMode } from "./enums/WrapMode";

/**
 * Per-Animator view of an `AnimatorState`. Overrides on this view only affect
 * the owning Animator; other Animators using the same controller are unaffected.
 */
export class AnimatorStateInstance {
  /** @internal */
  readonly _state: AnimatorState;
  /** @internal */
  readonly _playData: AnimatorStatePlayData;

  private _speed: number | undefined;
  private _wrapMode: WrapMode | undefined;

  get name(): string {
    return this._state.name;
  }

  get clip(): AnimationClip {
    return this._state.clip;
  }

  get clipStartTime(): number {
    return this._state.clipStartTime;
  }

  get clipEndTime(): number {
    return this._state.clipEndTime;
  }

  /** Playback speed for this Animator. */
  get speed(): number {
    return this._speed ?? this._state.speed;
  }

  set speed(value: number) {
    this._speed = value;
  }

  /** Wrap mode for this Animator. */
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
