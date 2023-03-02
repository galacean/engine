import { AnimatorStateTransition } from "../AnimatorStateTransition";
import { StateMachineState } from "../enums/StateMachineState";
import { AnimatorStateData } from "./AnimatorStateData";
import { AnimatorStatePlayData } from "../AnimatorStatePlayData";

/**
 * @internal
 */
export class AnimatorStateMachineData {
  animatorStateDataMap: Record<string, AnimatorStateData> = {};
  srcPlayData: AnimatorStatePlayData = new AnimatorStatePlayData();
  destPlayData: AnimatorStatePlayData = new AnimatorStatePlayData();
  stateMachineState: StateMachineState = StateMachineState.Standby;
  crossCurveMark: number = 0;
  manuallyTransition: AnimatorStateTransition = new AnimatorStateTransition();
  crossFadeTransition: AnimatorStateTransition;
  layerIndex: number;
  path: string;

  switchPlayData(): void {
    const srcPlayData = this.destPlayData;
    const switchTemp = this.srcPlayData;
    this.srcPlayData = srcPlayData;
    this.destPlayData = switchTemp;
  }
}
