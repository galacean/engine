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

export class AnimatorState {
  static states: AnimatorState[];
  name: string;
  behaviours: StateMachineBehaviour[]; //state的生命周期脚本
  motion: Motion; // Base class for AnimationClips and BlendTrees.
  transitions: AnimatorStateTransition[];
  speed: string | number;
  wrapMode: WrapMode;
  _type: AnimatorStateType;

  addStateMachineBehaviour(behaviour: StateMachineBehaviour) {}
  addTransition(destinationState: AnimatorState) {}
  removeTransition(transition: AnimatorStateTransition) {}
}
