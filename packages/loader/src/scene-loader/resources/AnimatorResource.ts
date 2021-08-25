import {
  AnimatorController,
  AnimatorControllerLayer,
  AnimatorStateMachine,
  AnimatorStateTransition
} from "@oasis-engine/core";
import { ResourceManager } from "@oasis-engine/core";
import { SchemaResource } from "./SchemaResource";
import { AssetConfig } from "../types";

export class AnimatorResource extends SchemaResource {
  private animatorControllerData;

  load(resourceManager: ResourceManager, assetConfig: AssetConfig): Promise<any> {
    return new Promise((resolve) => {
      if (!this._resource) {
        this._resource = new AnimatorController();
      }
      this.setMetaData("name", this.resource.name);
      const { animatorController } = assetConfig.props || {};
      this.animatorControllerData = animatorController;
      resolve(this);
    });
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
          console.warn(`AnimatorState name is exsited, auto reset to ${uniqueName}`);
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
