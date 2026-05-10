import { AnimatorState } from "./AnimatorState";
import { AnimatorStatePlayState } from "./enums/AnimatorStatePlayState";
import { WrapMode } from "./enums/WrapMode";
import { AnimatorStateData } from "./internal/AnimatorStateData";

/**
 * Per-Animator per-state runtime handle.
 *
 * Lifecycle: created lazily by AnimatorLayerData.getOrCreatePlayData on first access
 * (either via Animator.findAnimatorState or when the state begins playing). Persists
 * for the layer's lifetime, so per-instance overrides (e.g. speed) survive transitions
 * out of and back into the state.
 *
 * Public surface is intentionally narrow:
 * - `state`: the shared AnimatorState asset (read-only).
 * - `speed` / `clearSpeedOverride()`: per-instance speed override.
 *
 * All other fields are engine-managed runtime state and are underscore-prefixed to
 * mark them as implementation detail; mutating them from user code will corrupt
 * Animator invariants.
 */
export class AnimatorStatePlayData {
  /** The shared AnimatorState asset. Read-only reference. */
  readonly state: AnimatorState;

  /** @internal */
  _stateData: AnimatorStateData;
  /** @internal */
  _playedTime: number = 0;
  /** @internal */
  _playState: AnimatorStatePlayState = AnimatorStatePlayState.UnStarted;
  /** @internal */
  _clipTime: number = 0;
  /** @internal */
  _currentEventIndex: number = 0;
  /** @internal */
  _isForward = true;
  /** @internal */
  _offsetFrameTime: number = 0;

  private _speedOverride: number | undefined;
  private _changedOrientation = false;

  /**
   * Per-instance playback speed for this state.
   *
   * - Read: returns the override if set; otherwise live-reads `state.speed`.
   * - Write: sets the override. Subsequent changes to `state.speed` no longer affect this instance until `clearSpeedOverride()`.
   *
   * Override persists across state transitions.
   */
  get speed(): number {
    return this._speedOverride ?? this.state.speed;
  }

  set speed(value: number) {
    this._speedOverride = value;
  }

  /** Clear the per-instance speed override; resume tracking shared `state.speed`. */
  clearSpeedOverride(): void {
    this._speedOverride = undefined;
  }

  /** @internal */
  constructor(state: AnimatorState) {
    this.state = state;
  }

  /**
   * @internal
   * Reset runtime fields when (re-)entering this state. Does NOT touch user overrides.
   */
  resetForPlay(stateData: AnimatorStateData, offsetFrameTime: number): void {
    this._stateData = stateData;
    this._offsetFrameTime = offsetFrameTime;
    this._playedTime = 0;
    this._playState = AnimatorStatePlayState.UnStarted;
    this._clipTime = this.state.clipStartTime * this.state.clip.length;
    this._currentEventIndex = 0;
    this._isForward = true;
    this._changedOrientation = false;
    this.state._transitionCollection.needResetCurrentCheckIndex = true;
  }

  /** @internal */
  updateOrientation(deltaTime: number): void {
    if (deltaTime !== 0) {
      const lastIsForward = this._isForward;
      this._isForward = deltaTime > 0;
      if (this._isForward !== lastIsForward) {
        this._changedOrientation = true;
        this._isForward || this._correctTime();
      }
    }
  }

  /** @internal */
  update(deltaTime: number): void {
    this._playedTime += deltaTime;
    const state = this.state;
    let time = this._playedTime + this._offsetFrameTime;
    const duration = state._getDuration();
    this._playState = AnimatorStatePlayState.Playing;
    if (state.wrapMode === WrapMode.Loop) {
      time = duration ? time % duration : 0;
    } else {
      if (Math.abs(time) >= duration) {
        time = time < 0 ? -duration : duration;
        this._playState = AnimatorStatePlayState.Finished;
      }
    }

    time < 0 && (time += duration);
    this._clipTime = time + state.clipStartTime * state.clip.length;

    if (this._changedOrientation) {
      !this._isForward && this._correctTime();
      this._changedOrientation = false;
    }
  }

  private _correctTime() {
    const { state } = this;
    if (this._clipTime === 0) {
      this._clipTime = state.clipEndTime * state.clip.length;
    }
  }
}
