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
 * Use `playData.state.xxx` to access shared AnimatorState configuration (clip, transitions, etc.).
 * Use `playData.speed` for per-instance speed override (live-bound to state.speed when not overridden).
 * Engine-managed runtime fields (playState, clipTime, ...) are read-only by user convention.
 */
export class AnimatorStatePlayData {
  /** The shared AnimatorState asset. Read-only reference. */
  readonly state: AnimatorState;

  /** @internal */
  stateData: AnimatorStateData;
  /** @internal */
  playedTime: number = 0;
  /** Current playback state. Engine-managed. */
  playState: AnimatorStatePlayState = AnimatorStatePlayState.UnStarted;
  /** @internal */
  clipTime: number = 0;
  /** @internal */
  currentEventIndex: number = 0;
  /** @internal */
  isForward = true;
  /** @internal */
  offsetFrameTime: number = 0;

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
    this.stateData = stateData;
    this.offsetFrameTime = offsetFrameTime;
    this.playedTime = 0;
    this.playState = AnimatorStatePlayState.UnStarted;
    this.clipTime = this.state.clipStartTime * this.state.clip.length;
    this.currentEventIndex = 0;
    this.isForward = true;
    this.state._transitionCollection.needResetCurrentCheckIndex = true;
  }

  /** @internal */
  updateOrientation(deltaTime: number): void {
    if (deltaTime !== 0) {
      const lastIsForward = this.isForward;
      this.isForward = deltaTime > 0;
      if (this.isForward !== lastIsForward) {
        this._changedOrientation = true;
        this.isForward || this._correctTime();
      }
    }
  }

  /** @internal */
  update(deltaTime: number): void {
    this.playedTime += deltaTime;
    const state = this.state;
    let time = this.playedTime + this.offsetFrameTime;
    const duration = state._getDuration();
    this.playState = AnimatorStatePlayState.Playing;
    if (state.wrapMode === WrapMode.Loop) {
      time = duration ? time % duration : 0;
    } else {
      if (Math.abs(time) >= duration) {
        time = time < 0 ? -duration : duration;
        this.playState = AnimatorStatePlayState.Finished;
      }
    }

    time < 0 && (time += duration);
    this.clipTime = time + state.clipStartTime * state.clip.length;

    if (this._changedOrientation) {
      !this.isForward && this._correctTime();
      this._changedOrientation = false;
    }
  }

  private _correctTime() {
    const { state } = this;
    if (this.clipTime === 0) {
      this.clipTime = state.clipEndTime * state.clip.length;
    }
  }
}
