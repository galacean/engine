import { Entity } from "./../Entity";
import { AnimatorState } from "./AnimatorState";
import { AnimatorStateMachine } from "./AnimatorStateMachine";
export enum AnimatorLayerBlendingMode {
  Override,
  Additive
}

export interface AnimatorControllerLayerMap {
  [key: string]: AnimatorControllerLayer;
}

export class AnimatorControllerLayer {
  static layersMap: AnimatorControllerLayerMap = {};
  static findLayerByName(name: string) {
    return AnimatorState.statesMap[name];
  }
  weight: number = 1;
  blendingMode: AnimatorLayerBlendingMode = AnimatorLayerBlendingMode.Override;
  frameTime: number = 0;
  /** @internal */
  _target: Entity;
  /** @internal */
  _playingState: AnimatorState;
  /** @internal */
  _fadingState: AnimatorState;
  /** @internal */
  _stateMachine: AnimatorStateMachine;
  /**
   * @constructor
   * @param name - The AnimationClip's name.
   */

  set target(target: Entity) {
    this._target = target;
    if (this.stateMachine) {
      this.stateMachine.target = target;
    }
  }

  get stateMachine() {
    return this._stateMachine;
  }

  set stateMachine(stateMachine: AnimatorStateMachine) {
    if (this._target) {
      stateMachine.target = this._target;
    }
    this._stateMachine = stateMachine;
  }

  constructor(public readonly name: string) {
    AnimatorControllerLayer.layersMap[name] = this;
  }

  destroy() {
    delete AnimatorControllerLayer.layersMap[this.name];
  }
}
