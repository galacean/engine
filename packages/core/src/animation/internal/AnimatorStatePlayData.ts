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

  reset(state: AnimatorState, stateData: AnimatorStateData, offsetFrameTime: number): void {
    this.state = state;
    this.frameTime = offsetFrameTime;
    this.stateData = stateData;
    this.playState = AnimatorStatePlayState.UnStarted;
    this.clipTime = state.clipStartTime * state.clip.length;
    this.currentEventIndex = 0;
  }

  update(): void {
    const state = this.state;
    let time = this.frameTime;
    const duration = state._getDuration();
    const isBackwards = time < 0;
    this.playState = AnimatorStatePlayState.Playing;
    if (state.wrapMode === WrapMode.Loop) {
      time = time % duration;
      time < 0 && (time += duration);
    } else {
      if (Math.abs(time) > duration) {
        time = isBackwards ? -duration : duration;
        this.playState = AnimatorStatePlayState.Finished;
      }
    }
    this.clipTime = time + state.clipStartTime * state.clip.length;
  }
}
