import { AnimationClip } from "./AnimationClip";
import { AnimatorState } from "./AnimatorState";
import { AnimatorStateRuntime } from "./internal/AnimatorStateRuntime";
import { WrapMode } from "./enums/WrapMode";

/**
 * Per-Animator runtime view of a shared `AnimatorState` asset.
 *
 * `findAnimatorState` returns this view: each Animator gets its own instance
 * bound to a shared `AnimatorState` asset on the controller. Writes on
 * `speed` only affect this Animator; reads of asset fields (`name`, `clip`,
 * `wrapMode`, ...) forward to the shared state.
 *
 * Lifecycle: lazy-created by `Animator.findAnimatorState` on first access and
 * persists for the layer's lifetime so per-instance overrides survive
 * transitions out of and back into the state.
 *
 * The underlying `AnimatorState` asset is intentionally not part of the
 * public surface: it stays reachable through
 * `animator.animatorController.layers[i].stateMachine.findStateByName(name)`
 * for the rare editor / asset-construction case where you really need to
 * mutate the shared asset — the longer path is a visual reminder that the
 * change broadcasts to every Animator using the same controller.
 */
export class AnimatorStateInstance {
  /** @internal */
  _state: AnimatorState;
  /** @internal */
  _runtime: AnimatorStateRuntime;

  private _speed: number | undefined;

  /** The state's name (from the shared asset). */
  get name(): string {
    return this._state.name;
  }

  /** The animation clip (from the shared asset). */
  get clip(): AnimationClip {
    return this._state.clip;
  }

  /** The wrap mode (from the shared asset). */
  get wrapMode(): WrapMode {
    return this._state.wrapMode;
  }

  /** Normalized clip start time (from the shared asset). */
  get clipStartTime(): number {
    return this._state.clipStartTime;
  }

  /** Normalized clip end time (from the shared asset). */
  get clipEndTime(): number {
    return this._state.clipEndTime;
  }

  /**
   * Per-instance playback speed for this state.
   *
   * Read: returns the per-instance override if set, otherwise reads through
   * to the shared default.
   * Write: claims per-instance ownership; later changes to the shared default
   * no longer flow through. The per-instance value persists across state
   * transitions on the owning Animator.
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
