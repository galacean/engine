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
  name: string;
  animationClips: AnimationClip[];
  layers: AnimatorControllerLayer[];
  parameters: AnimatorControllerParameter[];

  // static createAnimatorControllerAtPath(path: string);
  // static parse(data: AnimatorControllerData);

  // exportData();
  addLayer(layer: AnimatorControllerLayer) {}

  addMotion(motion: Motion, layerIndex: number) {}

  addParameter(paramater: AnimatorControllerParameter) {}

  createBlendTree(name: string, tree: BlendTree, layerIndex: number) {}
  removeLayer(layerIndex: number) {}

  removeParameter(parameterIndex: number) {}

  setStateEffectiveBehaviours(state: AnimatorState, behaviours: StateMachineBehaviour[], layerIndex: number) {}

  setStateEffectiveMotion(state: AnimatorState, motion: Motion, layerIndex: number) {}
}
