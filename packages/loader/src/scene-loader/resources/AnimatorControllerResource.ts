import { AnimationClipResource } from "./AnimationClipResource";
import {
  AnimatorController,
  AnimatorControllerLayer,
  AnimatorStateMachine,
  AnimatorStateTransition
} from "@oasis-engine/core";
import { ResourceManager } from "@oasis-engine/core";
import { SchemaResource } from "./SchemaResource";
import { AssetConfig, LoadAttachedResourceResult } from "../types";

export class AnimatorControllerResource extends SchemaResource {
  public gltf;
  private animatorControllerData;
  private animationClipAssets: any[];
  private animationsIndices: {
    name: string;
    index: number;
  }[];

  load(resourceManager: ResourceManager, assetConfig: AssetConfig): Promise<any> {
    return new Promise((resolve) => {
      const { animatorController, animationClips: animationClipAssets, animationsIndices, gltf } =
        assetConfig.props || {};
      this._resource = new AnimatorController();
      this.animatorControllerData = animatorController;
      this.animationsIndices = animationsIndices || [];
      this.animationClipAssets = animationClipAssets || [];
      this.gltf = gltf;
      !animatorController && this._setDefaultDataByAnimationClip();
      this.setMetaData("name", assetConfig.name);
      resolve(this);
    });
  }

  loadWithAttachedResources(
    resourceManager: ResourceManager,
    assetConfig: AssetConfig
  ): Promise<LoadAttachedResourceResult> {
    return new Promise((resolve, reject) => {
      const clipLoadPromises = [];
      this.load(resourceManager, assetConfig).then(() => {
        const result: any = {
          resources: [this],
          structure: {
            index: 0,
            props: {
              animationClips: []
            }
          }
        };

        const animations = this.animationsIndices;
        for (let i = 0, length = animations.length; i < length; ++i) {
          const clip = animations[i];
          const clipResourse = new AnimationClipResource(this.resourceManager);
          this.attachedResources.push(clipResourse);
          clipLoadPromises.push(
            clipResourse.loadWithAttachedResources(resourceManager, {
              type: "animationClip",
              name: clip.name,
              props: clip
            })
          );
        }

        Promise.all(clipLoadPromises).then((res) => {
          const { animationClips } = result.structure.props;
          res.forEach((clip) => {
            const clipStructure = clip.structure;
            const clipResource = clip.resources[clipStructure.index];
            result.resources.push(clipResource);
            clipStructure.index = result.resources.length - 1;
            animationClips.push(clipStructure);
          });
          resolve(result);
        });
      });
    });
  }

  setMetaData(key, value) {
    this._meta[key] = value;
  }

  update(key: string, value: any) {
    this._initAnimatorController(value);
  }

  bind() {
    const { animatorControllerData, animationClipAssets } = this;
    this._bindClips(animationClipAssets);
    if (animatorControllerData) {
      this._initAnimatorController(animatorControllerData);
    } else {
      this._setDefaultDataByAnimationClipAsset();
    }
  }

  _initAnimatorController(animatorControllerData) {
    const { animations } = this.gltf || {};
    const { layers } = animatorControllerData;
    if (!animations || !layers) return;
    this._resource.clearLayers();
    for (let i = 0, length = layers.length; i < length; ++i) {
      const { name, blending, weight, stateMachine: stateMachineData } = layers[i];
      if (!stateMachineData) continue;
      const layer = new AnimatorControllerLayer(name);
      layer.blendingMode = blending;
      layer.weight = weight;
      const { states } = stateMachineData;
      const stateMachine = new AnimatorStateMachine();
      let stateMachineTransitions = [];
      for (let j = 0, length = states.length; j < length; ++j) {
        const stateData = states[j];
        const {
          name,
          transitions,
          clip,
          speed,
          wrapMode,
          clipStartNormalizedTime,
          clipEndNormalizedTime,
          isDefaultState
        } = stateData;
        const { id: clipAssetId } = clip || {};
        if (!clipAssetId) continue;
        const uniqueName = stateMachine.makeUniqueStateName(name);
        if (uniqueName !== name) {
          console.warn(`AnimatorState name is existed, name: ${name} reset to ${uniqueName}`);
        }
        const state = stateMachine.addState(uniqueName);
        state.speed = speed;
        state.wrapMode = wrapMode;
        const animationIndex = this.resourceManager.get(clipAssetId).resource;
        const animationClip = animations[animationIndex.index];
        state.clip = animationClip;
        state.clipStartTime = animationClip.length * clipStartNormalizedTime;
        state.clipEndTime = animationClip.length * clipEndNormalizedTime;
        for (let j = 0, length = transitions.length; j < length; ++j) {
          const transition = transitions[j];
          transitions[j].srcState = state;
          stateMachineTransitions.push(transition);
        }

        if (isDefaultState) {
          //@ts-ignore
          stateMachine._defaultState = state;
        }
      }
      for (let j = 0, length = stateMachineTransitions.length; j < length; ++j) {
        const transitionData = stateMachineTransitions[j];
        const transition = new AnimatorStateTransition();
        transition.duration = transitionData.duration;
        transition.offset = transitionData.offset;
        transition.exitTime = transitionData.exitTime;
        transition.destinationState = stateMachine.findStateByName(transitionData.targetStateName);
        transitionData.srcState.addTransition(transition);
        delete transitionData.srcState;
      }
      layer.stateMachine = stateMachine;
      this._resource.addLayer(layer);
    }
  }

  _bindClips(animationClips) {
    for (let i = 0, length = animationClips.length; i < length; i++) {
      const clipAsset = animationClips[i];
      const clipResource = this.resourceManager.get(clipAsset.id);
      if (clipResource) {
        this._attachedResources.push(clipResource);
      } else {
        `AnimatorResource: ${this.meta.name} can't find asset "animationClip", which id is: ${clipAsset.id}`;
      }
    }
  }

  _setDefaultDataByAnimationClipAsset() {
    const { animationClipAssets } = this;
    if (!animationClipAssets.length) {
      return;
    }
    let clips = [];
    for (let i = 0, length = animationClipAssets.length; i < length; i++) {
      const clipAsset = this.resourceManager.get(animationClipAssets[i].id);
      clips.push(clipAsset.resource);
    }
    this.animationsIndices = clips;
    this._setDefaultDataByAnimationClip();
  }

  _setDefaultDataByAnimationClip() {
    const { animationsIndices, _resource: animatorController, gltf } = this;
    if (!animationsIndices.length || !gltf) {
      return;
    }
    const { animations } = gltf
    const layer = new AnimatorControllerLayer("layer");
    const animatorStateMachine = new AnimatorStateMachine();
    animatorController.addLayer(layer);
    layer.stateMachine = animatorStateMachine;
    for (let i = 0, length = animationsIndices.length; i < length; i++) {
      const animationIndex = animationsIndices[i];
      const { name, index} = animationIndex
      const uniqueName = animatorStateMachine.makeUniqueStateName(name);
      if (uniqueName !== name) {
        console.warn(`AnimatorState name is existed, name: ${name} reset to ${uniqueName}`);
      }
      const animatorState = animatorStateMachine.addState(uniqueName);
      animatorState.clip = animations[index];
    }
  }
}
