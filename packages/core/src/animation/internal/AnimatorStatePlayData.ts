import { AnimatorStateInstance } from "../AnimatorStateInstance";
import { AnimatorStatePlayState } from "../enums/AnimatorStatePlayState";
import { WrapMode } from "../enums/WrapMode";
import { AnimatorStateData } from "./AnimatorStateData";

/**
 * @internal
 */
export class AnimatorStatePlayData {
  stateData: AnimatorStateData;

  playedTime: number = 0;
  playState: AnimatorStatePlayState = AnimatorStatePlayState.UnStarted;
  clipTime: number = 0;
  currentEventIndex: number = 0;
  isForward: boolean = true;
  offsetFrameTime: number = 0;

  private _changedOrientation: boolean = false;

  constructor(public readonly instance: AnimatorStateInstance) {}

  /** Reset playback fields on (re-)enter. Per-instance overrides are preserved. */
  resetForPlay(stateData: AnimatorStateData, offsetFrameTime: number): void {
    const state = this.instance._state;
    this.stateData = stateData;
    this.offsetFrameTime = offsetFrameTime;
    this.playedTime = 0;
    this.playState = AnimatorStatePlayState.UnStarted;
    this.clipTime = state.clipStartTime * state.clip.length;
    this.currentEventIndex = 0;
    this.isForward = true;
    this._changedOrientation = false;
    state._transitionCollection.needResetCurrentCheckIndex = true;
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
    const instance = this.instance;
    const state = instance._state;
    let time = this.playedTime + this.offsetFrameTime;
    const duration = state._getDuration();
    this.playState = AnimatorStatePlayState.Playing;
    if (instance.wrapMode === WrapMode.Loop) {
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

  private _correctTime(): void {
    const state = this.instance._state;
    // Reverse playback at clipTime=0 would step into negatives; jump to clipEnd.
    if (this.clipTime === 0) {
      this.clipTime = state.clipEndTime * state.clip.length;
    }
  }
}
