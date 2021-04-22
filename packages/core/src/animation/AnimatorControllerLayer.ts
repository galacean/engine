import { Entity } from "../Entity";
import { AnimatorState } from "./AnimatorState";
import { AnimatorStateMachine } from "./AnimatorStateMachine";
import { AnimatorLayerBlendingMode } from "./enums/AnimatorLayerBlendingMode";

export interface AnimatorControllerLayerMap {
  [key: string]: AnimatorControllerLayer;
}

export class AnimatorControllerLayer {
  /**
   * The name mapping of all layers.
   */
  static layersMap: AnimatorControllerLayerMap = {};
  /**
   * Get the layer by name.
   * @param name  The layer's name.
   */
  static findLayerByName(name: string): AnimatorControllerLayer {
    return AnimatorControllerLayer.layersMap[name];
  }
  /**
   * The blending weight that the layers has. It is not taken into account for the first layer.
   */
  weight: number = 1;
  /**
   * The blending mode used by the layer. It is not taken into account for the first layer.
   */
  blendingMode: AnimatorLayerBlendingMode = AnimatorLayerBlendingMode.Override;

  /**
   * Get the state machine for the layer.
   */
  get stateMachine() {
    return this._stateMachine;
  }

  /**
   * Set the state machine for the layer.
   */
  set stateMachine(stateMachine: AnimatorStateMachine) {
    if (this._target) {
      stateMachine._setTarget(this._target);
    }
    this._stateMachine = stateMachine;
  }

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
   * @param name - The layer's name.
   */
  constructor(public readonly name: string) {
    AnimatorControllerLayer.layersMap[name] = this;
  }

  /** @internal */
  _setTarget(target: Entity) {
    this._target = target;
    if (this.stateMachine) {
      this.stateMachine._setTarget(target);
    }
  }

  /** @internal */
  _destroy() {
    delete AnimatorControllerLayer.layersMap[this.name];
  }
}
