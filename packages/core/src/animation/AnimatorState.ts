import { AnimationClip } from "./AnimationClip";
import { AnimatorStateDef } from "./AnimatorStateDef";
import { AnimatorStateRuntime } from "./internal/AnimatorStateRuntime";
import { WrapMode } from "./enums/WrapMode";

/**
 * Per-Animator runtime view of an `AnimatorStateDef`.
 *
 * `findAnimatorState` returns this view: each Animator gets its own instance
 * bound to the shared `AnimatorStateDef` asset on the controller. Writes on
 * the per-instance fields (currently only `speed`) only affect this Animator;
 * reads of asset fields (`name`, `clip`, `wrapMode`, ...) forward to the shared
 * def.
 *
 * Lifecycle: lazy-created by `Animator.findAnimatorState` on first access and
 * persists for the layer's lifetime so per-instance overrides survive
 * transitions out of and back into the state.
 */
export class AnimatorState {
  /** The shared AnimatorStateDef asset this view is bound to. */
  readonly def: AnimatorStateDef;

  /** @internal */
  _runtime: AnimatorStateRuntime;

  private _speed: number | undefined;

  /** The state's name (from the shared asset). */
  get name(): string {
    return this.def.name;
  }

  /** The animation clip (from the shared asset). */
  get clip(): AnimationClip {
    return this.def.clip;
  }

  /** The wrap mode (from the shared asset). */
  get wrapMode(): WrapMode {
    return this.def.wrapMode;
  }

  /** Normalized clip start time (from the shared asset). */
  get clipStartTime(): number {
    return this.def.clipStartTime;
  }

  /** Normalized clip end time (from the shared asset). */
  get clipEndTime(): number {
    return this.def.clipEndTime;
  }

  /**
   * Per-instance playback speed for this state.
   *
   * Read: returns the per-instance override if set, otherwise reads through to `def.speed`.
   * Write: claims per-instance ownership; later changes to `def.speed` no longer flow through.
   * The per-instance value persists across state transitions on the owning Animator.
   */
  get speed(): number {
    return this._speed ?? this.def.speed;
  }

  set speed(value: number) {
    this._speed = value;
  }

  /** @internal */
  constructor(def: AnimatorStateDef) {
    this.def = def;
  }
}
