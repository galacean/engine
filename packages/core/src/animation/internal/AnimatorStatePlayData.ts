import { AnimatorState } from "../AnimatorState";
import { WrapMode } from "../enums/WrapMode";
import { AnimatorStateData } from "./AnimatorStataData";

/**
 * @internal
 */
export class AnimatorStatePlayData {
  state: AnimatorState;
  stateData: AnimatorStateData;
  frameTime: number;
  finished: boolean;
  clipTime: number;

  _update(): void {
    const state = this.state;
    let time = this.frameTime;
    const duration = state.clipEndTime - state.clipStartTime;
    if (time > duration) {
      if (state.wrapMode === WrapMode.Loop) {
        time = time % duration;
      } else {
        time = duration;
        this.finished = true;
      }
    }
    this.clipTime = time + this.state.clipStartTime;
  }
}
