import { AnimationClip } from "./AnimationClip";
import { AnimatorState } from "./AnimatorState";
import { AnimatorStateRuntime } from "./internal/AnimatorStateRuntime";
import { WrapMode } from "./enums/WrapMode";

/**
 * Per-Animator view of a shared `AnimatorState` asset.
 *
 * Writes on `speed` only affect this Animator. Other fields read through to
 * the shared asset. Lazy-created by `Animator.findAnimatorState` and persists
 * for the layer's lifetime, so overrides survive state transitions.
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

  /**
   * Per-instance playback speed. Unwritten reads return the shared default;
   * once written, this Animator owns its own speed.
   */
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
