import { AnimationClip } from "./AnimationClip";
import { AnimatorStateTransition } from "./AnimatorTransition";
import { Motion } from "./Motion";
import { StateMachineBehaviour } from "./AnimatorController";

export enum WrapMode {
  Once,
  Loop,
  PingPong,
  ClampForever
}

export enum AnimatorStateType {
  exit,
  any,
  entry,
  normal
}

export interface AnimatorStateMap {
  [key: string]: AnimatorState;
}

export class AnimatorState {
  static statesMap: AnimatorStateMap = {};
  static findStateByName(name: string) {
    return AnimatorState.statesMap[name];
  }
  _type: AnimatorStateType;
  motion: Motion; // Base class for AnimationClips and BlendTrees.
  name: string;
  behaviours: StateMachineBehaviour[]; //state的生命周期脚本
  transitions: AnimatorStateTransition[];
  speed: string | number;
  wrapMode: WrapMode;

  constructor(name: string) {
    this.name = name;
    AnimatorState.statesMap[name] = this;
  }

  _update(deltaTime: number) {}

  addStateMachineBehaviour(behaviour: StateMachineBehaviour) {}
  addTransition(destinationState: AnimatorState) {}
  removeTransition(transition: AnimatorStateTransition) {}
}
