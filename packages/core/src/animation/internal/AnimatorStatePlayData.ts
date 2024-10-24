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
  frameTime: number;
  playState: AnimatorStatePlayState;
  clipTime: number;
  currentEventIndex: number;
  currentTransitionIndex: number;
  isForwards = true;

  private _changedOrientation = false;

  reset(state: AnimatorState, stateData: AnimatorStateData, offsetFrameTime: number): void {
    this.state = state;
    this.frameTime = offsetFrameTime;
    this.stateData = stateData;
    this.playState = AnimatorStatePlayState.UnStarted;
    this.clipTime = state.clipStartTime * state.clip.length;
    this.currentEventIndex = 0;
    this.currentTransitionIndex = state._transitionCollection._noExitTimeCount;
    this.isForwards = true;
  }

  updateOrientation(deltaTime: number): void {
    if (deltaTime !== 0) {
      const lastIsForwards = this.isForwards;
      this.isForwards = deltaTime > 0;
      if (this.isForwards !== lastIsForwards) {
        this._changedOrientation = true;
        this.isForwards || this._correctTime();
      }
    }
  }

  update(deltaTime: number): void {
    this.frameTime += deltaTime;
    const state = this.state;
    let time = this.frameTime;
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
      !this.isForwards && this._correctTime();
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
