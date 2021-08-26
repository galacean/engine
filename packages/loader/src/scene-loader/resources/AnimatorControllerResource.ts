import { AnimationClipResource } from './AnimationClipResource';
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
  private animatorControllerData;
  private animationClips: any[] = [];

  load(resourceManager: ResourceManager, assetConfig: AssetConfig): Promise<any> {
    return new Promise((resolve) => {
      if (!this._resource) {
        this._resource = new AnimatorController();
      }
      this.setMetaData("name", assetConfig.name);
      console.log('AnimatorControllerResource', assetConfig);
      const { animatorController, animationClips } = assetConfig.props || {};
      this.animatorControllerData = animatorController;
      this.animationClips = animationClips || [];
      resolve(this);
    });
  }

  loadWithAttachedResources(
    resourceManager: ResourceManager,
    assetConfig: AssetConfig
  ): Promise<LoadAttachedResourceResult> {
    return new Promise((resolve, reject) => {
      let loadPromise;
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
        }

        const animations = this.animationClips;
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
      })
    })
  }

  setMetaData(key, value) {
    this._meta[key] = value;
  }

  update(key: string, value: any) {
    this.initAnimatorController(value);
  }

  bind() {
    const { animatorControllerData } = this;
    animatorControllerData && this.initAnimatorController(animatorControllerData);
  }

  initAnimatorController(animatorControllerData) {
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
        const { name, transitions, clip, speed, wrapMode, clipStartNormalizedTime, clipEndNormalizedTime } = stateData;
        const { id: clipAssetId } = clip || {};
        if (!clipAssetId) continue;
        const uniqueName = stateMachine.makeUniqueStateName(name);
        if (uniqueName !== name) {
          console.warn(`AnimatorState name is exsited, name: ${ name } reset to ${ uniqueName }`);
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
}
