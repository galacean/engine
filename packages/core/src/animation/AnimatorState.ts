import { AnimationClip } from "./AnimationClip";
import { Entity } from "./../Entity";
import { AnimatorStateTransition } from "./AnimatorTransition";
import { Motion } from "./Motion";
import { StateMachineBehaviour } from "./AnimatorController";
import { WrapMode } from "./AnimatorConst";

export enum PlayType {
  NotStart,
  IsPlaying,
  IsFading,
  IsFinish
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
  _motion: Motion; // Base class for AnimationClips and BlendTrees.
  name: string;
  behaviours: StateMachineBehaviour[] = []; //state的生命周期脚本
  transitions: AnimatorStateTransition[] = [];
  speed: string | number;
  wrapMode: WrapMode;
  /**
   * @internal
   */
  _playType: PlayType = PlayType.NotStart;
  /**
   * @internal
   */
  _frameTime: number = 0;
  /**
   * @internal
   */
  _type: AnimatorStateType;
  /**
   * @internal
   */
  _target: Entity;
  /**
   * @internal
   */
  set target(target: Entity) {
    this._target = target;
    if (this.motion) {
      this.motion.target = target;
    }
  }

  get motion() {
    return this._motion;
  }
  set motion(motion: Motion) {
    if (this._target) {
      motion.target = this._target;
    }
    this._motion = motion;
  }
  constructor(name: string) {
    this.name = name;
    AnimatorState.statesMap[name] = this;
  }

  addStateMachineBehaviour(behaviour: StateMachineBehaviour) {}

  addTransition(destinationState: AnimatorState) {
    const transition = new AnimatorStateTransition();
    transition.destinationState = destinationState;
    this.transitions.push(transition);
    return transition;
  }

  removeTransition(transition: AnimatorStateTransition) {
    this.transitions.splice(this.transitions.indexOf(transition), 1);
  }

  clearTransitions() {
    const length = this.transitions.length;
    for (let i = length - 1; i >= 0; i--) {
      this.transitions[i] = null;
    }
    this.transitions = [];
  }

  destroy() {
    delete AnimatorState.statesMap[this.name];
  }
}
