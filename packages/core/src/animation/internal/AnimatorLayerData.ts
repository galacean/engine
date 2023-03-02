import { AnimatorStateMachine } from "../AnimatorStateMachine";
import { StateMachineState } from "../enums/StateMachineState";
import { AnimatorStateMachineData } from "./AnimatorStateMachineData";

/**
 * @internal
 */
export class AnimatorLayerData {
  currentStateMachineData: AnimatorStateMachineData;
  stateMachineMap: Record<string, AnimatorStateMachine> = {};
  stateMachineDataMap: Record<string, AnimatorStateMachineData> = {};

  pushStateMachineData(stateMachine: AnimatorStateMachine) {
    const currentPath = this.currentStateMachineData.path;
    const newPath = `${currentPath}/${stateMachine.name}`;
    const stateMachineData = this.getAnimatorStateMachineData(newPath, stateMachine);
    stateMachineData.stateMachineState = StateMachineState.Playing;
    stateMachineData.srcPlayData = this.currentStateMachineData.srcPlayData;
    this.currentStateMachineData = stateMachineData;
  }

  popStateMachineData(): AnimatorStateMachineData {
    const currentStateMachineData = this.currentStateMachineData;
    const currentPath = currentStateMachineData.path;
    if (currentPath) {
      const newPath = currentPath.split("/").slice(0, -1).join("/");
      const newStateMachineData = (this.currentStateMachineData = this.stateMachineDataMap[newPath]);
      newStateMachineData.stateMachineState = StateMachineState.Playing;
      newStateMachineData.srcPlayData = currentStateMachineData.srcPlayData;
      return newStateMachineData;
    }
    return null;
  }

  getAnimatorStateMachineData(stateMachinePath: string, stateMachine: AnimatorStateMachine): AnimatorStateMachineData {
    let animatorStateMachineData = this.stateMachineDataMap[stateMachinePath];
    if (!animatorStateMachineData) {
      this.stateMachineDataMap[stateMachinePath] = animatorStateMachineData = new AnimatorStateMachineData();
      this.stateMachineMap[stateMachinePath] = stateMachine;
    }
    animatorStateMachineData.path = stateMachinePath;
    return animatorStateMachineData;
  }
}
