import {
  resourceLoader,
  Loader,
  AssetPromise,
  AssetType,
  LoadItem,
  ResourceManager,
  AnimatorController,
  AnimatorControllerLayer,
  AnimatorStateTransition,
  AnimatorState,
  AnimatorConditionMode,
  AnimatorControllerParameterValue,
  WrapMode
} from "@galacean/engine-core";

@resourceLoader(AssetType.AnimatorController, ["json"], false)
class AnimatorControllerLoader extends Loader<AnimatorController> {
  load(item: LoadItem, resourceManager: ResourceManager): AssetPromise<AnimatorController> {
    return new AssetPromise((resolve, reject) => {
      this.request<any>(item.url, {
        ...item,
        type: "json"
      })
        .then((data) => {
          const animatorController = new AnimatorController(resourceManager.engine);
          const { layers, parameters } = data;
          const promises = [];
          layers.forEach((layerData, layerIndex: number) => {
            const { name, blendingMode, weight, stateMachine: stateMachineData } = layerData;
            const layer = new AnimatorControllerLayer(name);
            layer.blendingMode = blendingMode;
            layer.weight = weight;
            if (stateMachineData) {
              const { states, transitions, entryTransitions, anyTransitions } = stateMachineData;
              const stateMachine = layer.stateMachine;
              const statesMap: Record<string, AnimatorState> = {};
              const transitionsMap: Record<string, AnimatorStateTransition> = {};
              states.forEach((stateData: IStateData, stateIndex: number) => {
                const {
                  id,
                  name,
                  speed,
                  wrapMode,
                  clipStartNormalizedTime,
                  clipEndNormalizedTime,
                  clip: clipData,
                  scripts
                } = stateData;
                const state = stateMachine.addState(name);
                state.speed = speed;
                state.wrapMode = wrapMode;
                state.clipStartTime = clipStartNormalizedTime;
                state.clipEndTime = clipEndNormalizedTime;
                scripts.forEach((script) => {
                  state.addStateMachineScript(Loader.getClass(script));
                });
                statesMap[id] = state;
                if (clipData) {
                  promises.push(
                    new Promise((resolve) => {
                      //@ts-ignore
                      resourceManager.getResourceByRef(clipData).then((clip) => {
                        resolve({
                          layerIndex,
                          stateIndex,
                          clip
                        });
                      });
                    })
                  );
                }
              });
              transitions.forEach((transitionData: ITransitionData) => {
                const transition = this._createTransition(transitionData, statesMap[transitionData.destinationStateId]);
                transitionsMap[transitionData.id] = transition;
              });

              states.forEach((stateData: IStateData) => {
                const { id, transitions } = stateData;
                transitions.forEach((transitionId) => {
                  const transition = transitionsMap[transitionId];
                  transition && statesMap[id].addTransition(transition);
                });
              });

              entryTransitions.forEach((entryTransitionData: ITransitionData) => {
                stateMachine.addEntryStateTransition(
                  this._createTransition(entryTransitionData, statesMap[entryTransitionData.destinationStateId])
                );
              });

              anyTransitions.forEach((anyTransitionData: ITransitionData) => {
                stateMachine.addAnyStateTransition(
                  this._createTransition(anyTransitionData, statesMap[anyTransitionData.destinationStateId])
                );
              });
            }
            animatorController.addLayer(layer);
          });
          parameters.forEach((parameterData) => {
            if (parameterData.isTrigger) {
              animatorController.addTriggerParameter(parameterData.name);
            } else {
              animatorController.addParameter(parameterData.name, parameterData.defaultValue);
            }
          });
          Promise.all(promises).then((clipData) => {
            clipData.forEach((data) => {
              const { layerIndex, stateIndex, clip } = data;
              animatorController.layers[layerIndex].stateMachine.states[stateIndex].clip = clip;
            });
            resolve(animatorController);
          });
        })
        .catch(reject);
    });
  }

  private _createTransition(transitionData: ITransitionData, destinationState: AnimatorState): AnimatorStateTransition {
    const transition = new AnimatorStateTransition();
    transition.hasExitTime = transitionData.hasExitTime;
    transition.duration = transitionData.duration;
    transition.offset = transitionData.offset;
    transition.exitTime = transitionData.exitTime;
    transition.solo = transitionData.solo;
    transition.mute = transitionData.mute;
    // @ts-ignore
    transition._isExit = transitionData.isExit;
    transition.destinationState = destinationState;
    transitionData.conditions.forEach((conditionData) => {
      transition.addCondition(conditionData.parameterName, conditionData.mode, conditionData.threshold);
    });
    return transition;
  }
}

interface IStateData {
  id?: string;
  name: string;
  speed: number;
  wrapMode: WrapMode;
  clipStartNormalizedTime: number;
  clipEndNormalizedTime: number;
  clip: any;
  transitions: string[];
  scripts: string[];
  isEntryState: boolean;
  isExitState: boolean;
  isAnyState: boolean;
}

interface ITransitionData {
  id?: string;
  duration: number;
  offset: number;
  exitTime: number;
  destinationStateId: string;
  solo: boolean;
  mute: boolean;
  isExit: boolean;
  conditions: IConditionData[];
  hasExitTime: boolean;
}

interface IConditionData {
  mode: AnimatorConditionMode;
  parameterName: string;
  threshold?: AnimatorControllerParameterValue;
}
