import { AnimationClip } from "./AnimationClip";
import { AnimatorStateDef } from "./AnimatorStateDef";
import { AnimatorStateRuntime } from "./internal/AnimatorStateRuntime";
import { WrapMode } from "./enums/WrapMode";

/**
 * Per-Animator runtime view of an `AnimatorStateDef`.
 *
 * `findAnimatorState` returns this view: each Animator gets its own instance
 * bound to a shared `AnimatorStateDef` asset on the controller. Writes on
 * `speed` only affect this Animator; reads of asset fields (`name`, `clip`,
 * `wrapMode`, ...) forward to the shared def.
 *
 * Lifecycle: lazy-created by `Animator.findAnimatorState` on first access and
 * persists for the layer's lifetime so per-instance overrides survive
 * transitions out of and back into the state.
 *
 * The underlying `AnimatorStateDef` is intentionally not part of the public
 * surface: it stays reachable through `animator.animatorController.layers[i]
 * .stateMachine.findStateByName(name)` for the rare editor / asset-construction
 * case where you really need to mutate the shared asset — the longer path is
 * a visual reminder that the change broadcasts to every Animator using the
 * same controller.
 */
export class AnimatorState {
  /** @internal */
  _def: AnimatorStateDef;
  /** @internal */
  _runtime: AnimatorStateRuntime;

  private _speed: number | undefined;

  /** The state's name (from the shared asset). */
  get name(): string {
    return this._def.name;
  }

  /** The animation clip (from the shared asset). */
  get clip(): AnimationClip {
    return this._def.clip;
  }

  /** The wrap mode (from the shared asset). */
  get wrapMode(): WrapMode {
    return this._def.wrapMode;
  }

  /** Normalized clip start time (from the shared asset). */
  get clipStartTime(): number {
    return this._def.clipStartTime;
  }

  /** Normalized clip end time (from the shared asset). */
  get clipEndTime(): number {
    return this._def.clipEndTime;
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
    return this._speed ?? this._def.speed;
  }

  set speed(value: number) {
    this._speed = value;
  }

  /** @internal */
  constructor(def: AnimatorStateDef) {
    this._def = def;
  }
}
