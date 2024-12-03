import { AnimatorState } from "../AnimatorState";
import { AnimatorStatePlayState } from "../enums/AnimatorStatePlayState";
import { WrapMode } from "../enums/WrapMode";
import { AnimatorStateData } from "./AnimatorStateData";

/**
 * @internal
 */
export class AnimatorStatePlayData {
  state: AnimatorState;
  stateData: AnimatorStateData;
  playedTime: number;
  playState: AnimatorStatePlayState;
  clipTime: number;
  currentEventIndex: number;
  isForward = true;
  offsetFrameTime: number;

  private _changedOrientation = false;

  reset(state: AnimatorState, stateData: AnimatorStateData, offsetFrameTime: number): void {
    this.state = state;
    this.playedTime = 0;
    this.offsetFrameTime = offsetFrameTime;
    this.stateData = stateData;
    this.playState = AnimatorStatePlayState.UnStarted;
    this.clipTime = state.clipStartTime * state.clip.length;
    this.currentEventIndex = 0;
    this.isForward = true;
    this.state._transitionCollection.needResetCurrentCheckIndex = true;
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
