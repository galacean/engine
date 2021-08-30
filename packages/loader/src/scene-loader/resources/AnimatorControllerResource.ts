import { AnimationClipResource } from "./AnimationClipResource";
import {
  AnimatorController,
  AnimatorControllerLayer,
  AnimatorStateMachine,
  AnimatorStateTransition,
  AnimationClip
} from "@oasis-engine/core";
import { ResourceManager } from "@oasis-engine/core";
import { SchemaResource } from "./SchemaResource";
import { AssetConfig, LoadAttachedResourceResult } from "../types";

export class AnimatorControllerResource extends SchemaResource {
  private animatorControllerData;
  private animationClipAssets: any[];
  private initAnimationClips: AnimationClip[];

  load(resourceManager: ResourceManager, assetConfig: AssetConfig): Promise<any> {
    return new Promise((resolve) => {
      const { animatorController, animationClips: animationClipAssets, animations: initAnimationClips } =
        assetConfig.props || {};
      this._resource = new AnimatorController();
      this.animatorControllerData = animatorController;
      this.initAnimationClips = initAnimationClips || [];
      this.animationClipAssets = animationClipAssets || [];
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

        const animations = this.initAnimationClips;
        for (let i = 0, length = animations.length; i < length; ++i) {
          const clip = animations[i];
          const clipResourse = new AnimationClipResource(this.resourceManager);
          this.attachedResources.push(clipResourse);
          clipLoadPromises.push(
            clipResourse.loadWithAttachedResources(resourceManager, {
              type: "animationClip",
              name: clip.name,
              resource: clip
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
    const { layers } = animatorControllerData;
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
        const { name, transitions, clip, speed, wrapMode, clipStartNormalizedTime, clipEndNormalizedTime, isDefaultState } = stateData;
        const { id: clipAssetId } = clip || {};
        if (!clipAssetId) continue;
        const uniqueName = stateMachine.makeUniqueStateName(name);
        if (uniqueName !== name) {
          console.warn(`AnimatorState name is exsited, name: ${name} reset to ${uniqueName}`);
        }
        const state = stateMachine.addState(uniqueName);
        state.speed = speed;
        state.wrapMode = wrapMode;
        const animationClip = this.resourceManager.get(clipAssetId).resource;
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
    const { animationClipAssets, _resource: animatorController } = this;
    if (!animationClipAssets.length) {
      return;
    }
    let clips = [];
    for (let i = 0; i < animationClipAssets.length; i++) {
      const clipAsset = this.resourceManager.get(animationClipAssets[i].id);
      clips.push(clipAsset.resource)
      
    }
    this.initAnimationClips = clips;
    this._setDefaultDataByAnimationClip();
  }

  _setDefaultDataByAnimationClip() {
    const { initAnimationClips: animationClips, _resource: animatorController } = this;
    if (!animationClips.length) {
      return;
    }
    const layer = new AnimatorControllerLayer("layer");
    const animatorStateMachine = new AnimatorStateMachine();
    animatorController.addLayer(layer);
    layer.stateMachine = animatorStateMachine;
    for (let i = 0; i < animationClips.length; i++) {
      const animationClip = animationClips[i];
      const name = animationClip.name;
      const uniqueName = animatorStateMachine.makeUniqueStateName(name);
      if (uniqueName !== name) {
        console.warn(`AnimatorState name is exsited, name: ${name} reset to ${uniqueName}`);
      }
      const animatorState = animatorStateMachine.addState(uniqueName);
      animatorState.clip = animationClip;
    }
  }
}
