import { AnimationClip } from "./AnimationClip";
import { AnimatorState } from "./AnimatorState";
import { AnimatorStateRuntime } from "./internal/AnimatorStateRuntime";
import { WrapMode } from "./enums/WrapMode";

/**
 * Per-Animator view of an `AnimatorState`. Overrides on this view only affect
 * the owning Animator; other Animators using the same controller are unaffected.
 */
export class AnimatorStateInstance {
  /** @internal */
  _state: AnimatorState;
  /** @internal */
  _runtime: AnimatorStateRuntime;

  private _speed: number | undefined;

  get name(): string {
    return this._state.name;
  }

  get clip(): AnimationClip {
    return this._state.clip;
  }

  get wrapMode(): WrapMode {
    return this._state.wrapMode;
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

  /** @internal */
  constructor(state: AnimatorState) {
    this._state = state;
  }
}
