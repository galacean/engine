import {
  resourceLoader,
  Loader,
  AssetPromise,
  AssetType,
  LoadItem,
  ResourceManager,
  AnimatorController,
  AnimatorControllerLayer,
  AnimatorStateMachine,
  AnimatorStateTransition
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
          const animatorController = new AnimatorController();
          const { layers } = data;
          const promises = [];
          layers.forEach((layerData, layerIndex: number) => {
            const { name, blendingMode, weight, stateMachine: stateMachineData } = layerData;
            const layer = new AnimatorControllerLayer(name);
            layer.blendingMode = blendingMode;
            layer.weight = weight;
            if (stateMachineData) {
              const { states } = stateMachineData;
              const stateMachine = (layer.stateMachine = new AnimatorStateMachine());
              states.forEach((stateData, stateIndex: number) => {
                const {
                  name,
                  speed,
                  wrapMode,
                  clipStartNormalizedTime,
                  clipEndNormalizedTime,
                  isDefaultState,
                  clip: clipData,
                  scripts
                } = stateData;
                const state = stateMachine.addState(name);
                isDefaultState && (stateMachine.defaultState = state);
                state.speed = speed;
                state.wrapMode = wrapMode;
                state.clipStartTime = clipStartNormalizedTime;
                state.clipEndTime = clipEndNormalizedTime;
                const scriptsObject = JSON.parse(scripts);
                scriptsObject?.forEach((script) => {
                  state.addStateMachineScript(Loader.getClass(script));
                });
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
              states.forEach((stateData) => {
                const { name, transitions } = stateData;
                transitions.forEach((transitionData) => {
                  const { targetStateName, duration, offset, exitTime } = transitionData;
                  const sourceState = stateMachine.findStateByName(name);
                  const destState = stateMachine.findStateByName(targetStateName);
                  const transition = new AnimatorStateTransition();
                  transition.destinationState = destState;
                  transition.duration = duration;
                  transition.exitTime = exitTime;
                  transition.offset = offset;
                  sourceState.addTransition(transition);
                });
              });
            }
            animatorController.addLayer(layer);
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
}
