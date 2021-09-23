import {
  Engine,
  AnimatorController,
  AnimatorControllerLayer,
  AnimatorStateMachine,
  AnimationClip,
  AnimatorStateTransition,
  AssetType
} from "@oasis-engine/core";
import type { BufferReader } from "../../utils/BufferReader";
import { decoder } from "../../utils/Decorator";

@decoder("AnimatorController")
export class AnimatorControllerDecoder {
  public static decode(engine: Engine, bufferReader: BufferReader): Promise<AnimatorController> {
    return new Promise(async (resolve) => {
      const animatorController = new AnimatorController();
      const objectId = bufferReader.nextUint16();
      const layersLen = bufferReader.nextUint16();
      const clipLoadPromises = [];

      for (let i = 0; i < layersLen; ++i) {
        const name = bufferReader.nextStr();
        const layer = new AnimatorControllerLayer(name);
        layer.blendingMode = bufferReader.nextUint8();
        layer.weight = bufferReader.nextFloat32();
        const stateMachine = new AnimatorStateMachine();
        const statesLen = bufferReader.nextUint16();
        for (let j = 0; j < statesLen; ++j) {
          const stateName = bufferReader.nextStr();
          const state = stateMachine.addState(stateName);
          state.speed = bufferReader.nextFloat32();
          state.wrapMode = bufferReader.nextUint8();
          const isDefaultState = bufferReader.nextUint8() ? true : false;
          const clipStartNormalizedTime = bufferReader.nextFloat32();
          const clipEndNormalizedTime = bufferReader.nextFloat32();
          const clipPath = bufferReader.nextStr();
          const clipObjectId = bufferReader.nextStr();
          ((state) => {
            clipLoadPromises.push(
              AnimatorControllerDecoder.loadAndSetClip(engine, clipPath, clipObjectId).then((clip) => {
                state.clip = clip;
                state.clipStartTime = clip.length * clipStartNormalizedTime;
                state.clipEndTime = clip.length * clipEndNormalizedTime;
              })
            );
          })(state);
          // @ts-ignore
          isDefaultState && (stateMachine._defaultState = state);

          const transitionsLen = bufferReader.nextUint16();
          for (let k = 0; k < transitionsLen; ++k) {
            const transition = new AnimatorStateTransition();
            transition.duration = bufferReader.nextFloat32();
            transition.offset = bufferReader.nextFloat32();
            transition.exitTime = bufferReader.nextFloat32();
            transition.exitTime = bufferReader.nextFloat32();
            transition.destinationState = stateMachine.findStateByName(bufferReader.nextStr());
            state.addTransition(transition);
          }
        }
        layer.stateMachine = stateMachine;
        animatorController.addLayer(layer);
      }

      Promise.all(clipLoadPromises).then(() => {
        // @ts-ignore
        engine.resourceManager._objectPool[objectId] = animatorController;
        resolve(animatorController);
      });
    });
  }

  public static loadAndSetClip(engine: Engine, path: string, objectId: string): Promise<AnimationClip> {
    return new Promise((resolve) => {
      engine.resourceManager
        .load({
          url: path,
          // @ts-ignore
          type: AssetType.Oasis
        })
        .then(() => {
          // 从缓存池获取对象
          // @ts-ignore
          resolve(engine.resourceManager._objectPool[clipObjectId]);
        });
    });
  }
}
