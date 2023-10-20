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

  reset(state: AnimatorState, stateData: AnimatorStateData, offsetFrameTime: number): void {
    this.state = state;
    this.frameTime = offsetFrameTime;
    this.stateData = stateData;
    this.playState = AnimatorStatePlayState.UnStarted;
    this.clipTime = state.clipStartTime * state.clip.length;
    this.currentEventIndex = 0;
    this.currentTransitionIndex = 0;
  }

  update(isBackwards: boolean): void {
    const state = this.state;
    let time = this.frameTime;
    const duration = state._getDuration();
    this.playState = AnimatorStatePlayState.Playing;
    if (state.wrapMode === WrapMode.Loop) {
      time = duration ? time % duration : 0;
    } else {
      if (Math.abs(time) > duration) {
        time = time < 0 ? -duration : duration;
        this.playState = AnimatorStatePlayState.Finished;
      }
    }

    if (isBackwards && time === 0) {
      this.clipTime = state.clipEndTime * state.clip.length;
    } else {
      time < 0 && (time += duration);
      this.clipTime = time + state.clipStartTime * state.clip.length;
    }
  }
}
