import { Entity } from "./../Entity";
import { AnimatorState } from "./AnimatorState";
import { BlendTree } from "./BlendTree";
import { AnimatorControllerLayer } from "./AnimatorControllerLayer";
import { Motion } from "./Motion";
import { AnimationClip } from "./AnimationClip";
export interface AnimatorControllerParameter {
  name: string;
  value: any;
}

export interface StateMachineBehaviour {
  id: string; // script assetId
}

export class AnimatorController {
  /** @internal */
  _target: Entity;
  name: string;
  animationClips: AnimationClip[] = [];
  layers: AnimatorControllerLayer[] = [];
  parameters: AnimatorControllerParameter[] = [];

  set target(target: Entity) {
    this._target = target;
    const layerCount = this.layers.length;
    for (let i = layerCount - 1; i >= 0; i--) {
      this.layers[i].target = target;
    }
  }

  addLayer(layer: AnimatorControllerLayer) {
    if (this._target) {
      layer.target = this._target;
    }
    this.layers.push(layer);
  }

  removeLayer(layerIndex: number) {
    this.layers.splice(layerIndex, 1);
    this.layers[layerIndex].destroy();
  }

  addMotion(motion: Motion, layerIndex: number) {}

  addParameter(paramater: AnimatorControllerParameter) {}

  removeParameter(parameterIndex: number) {}

  createBlendTree(name: string, tree: BlendTree, layerIndex: number) {}

  setStateEffectiveBehaviours(state: AnimatorState, behaviours: StateMachineBehaviour[], layerIndex: number) {}

  setStateEffectiveMotion(state: AnimatorState, motion: Motion, layerIndex: number) {}
}
