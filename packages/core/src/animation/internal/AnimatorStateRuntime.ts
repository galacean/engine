import { AnimatorState } from "../AnimatorState";
import { AnimatorStatePlayState } from "../enums/AnimatorStatePlayState";
import { WrapMode } from "../enums/WrapMode";
import { AnimatorStateData } from "./AnimatorStateData";

/**
 * @internal
 *
 * Engine-owned runtime playback state for a single (Animator, AnimatorStateDef) pair.
 *
 * Lives alongside an `AnimatorState` (user-facing per-instance view) and tracks
 * evaluation-time fields: how much has played, current clip time, play state,
 * event index, orientation, etc. Mutated by the Animator's update loop; not
 * exposed to user code.
 */
export class AnimatorStateRuntime {
  /** The user-facing per-instance view this runtime is bound to. */
  readonly state: AnimatorState;

  /** Curve owners + event handlers (shared per-Animator per-state). */
  stateData: AnimatorStateData;

  playedTime: number = 0;
  playState: AnimatorStatePlayState = AnimatorStatePlayState.UnStarted;
  clipTime: number = 0;
  currentEventIndex: number = 0;
  isForward: boolean = true;
  offsetFrameTime: number = 0;

  private _changedOrientation: boolean = false;

  constructor(state: AnimatorState) {
    this.state = state;
    state._runtime = this;
  }

  /**
   * Reset runtime fields when (re-)entering this state.
   * Does NOT touch user-written per-instance overrides on `state`.
   */
  resetForPlay(stateData: AnimatorStateData, offsetFrameTime: number): void {
    const def = this.state.def;
    this.stateData = stateData;
    this.offsetFrameTime = offsetFrameTime;
    this.playedTime = 0;
    this.playState = AnimatorStatePlayState.UnStarted;
    this.clipTime = def.clipStartTime * def.clip.length;
    this.currentEventIndex = 0;
    this.isForward = true;
    this._changedOrientation = false;
    def._transitionCollection.needResetCurrentCheckIndex = true;
  }

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

  update(deltaTime: number): void {
    this.playedTime += deltaTime;
    const def = this.state.def;
    let time = this.playedTime + this.offsetFrameTime;
    const duration = def._getDuration();
    this.playState = AnimatorStatePlayState.Playing;
    if (def.wrapMode === WrapMode.Loop) {
      time = duration ? time % duration : 0;
    } else {
      if (Math.abs(time) >= duration) {
        time = time < 0 ? -duration : duration;
        this.playState = AnimatorStatePlayState.Finished;
      }
    }

    time < 0 && (time += duration);
    this.clipTime = time + def.clipStartTime * def.clip.length;

    if (this._changedOrientation) {
      !this.isForward && this._correctTime();
      this._changedOrientation = false;
    }
  }

  private _correctTime(): void {
    const def = this.state.def;
    // Reverse playback resumed at clipTime=0 would step into negatives; jump to
    // clipEnd so the next sample continues seamlessly from the end of the clip.
    if (this.clipTime === 0) {
      this.clipTime = def.clipEndTime * def.clip.length;
    }
  }
}
