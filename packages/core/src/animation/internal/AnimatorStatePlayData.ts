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
    this.clipTime = this.state.clipStartTime;
    this.currentEventIndex = 0;
  }

  update(): void {
    const state = this.state;
    let time = this.frameTime;
    const duration = state.clipEndTime - state.clipStartTime;
    this.playState = AnimatorStatePlayState.Playing;
    if (time > duration) {
      if (state.wrapMode === WrapMode.Loop) {
        time = time % duration;
      } else {
        time = duration;
        this.playState = AnimatorStatePlayState.Finished;
      }
    }
    this.clipTime = time + this.state.clipStartTime;
  }
}
