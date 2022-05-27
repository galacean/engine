import { BufferWriter } from "../../utils/BufferWriter";
import { encoder } from "../../utils/Decorator";
import { IAnimatorControllerAsset } from "./type";

@encoder("AnimatorController")
export class AnimatorControllerEncoder {
  static encode(bufferWriter: BufferWriter, data: IAnimatorControllerAsset) {
    const { layers } = data;

    bufferWriter.writeUint16(layers.length);
    layers.forEach((layer) => {
      const {
        stateMachine: { states }
      } = layer;
      bufferWriter.writeStr(layer.name);
      bufferWriter.writeUint8(layer.blending);
      bufferWriter.writeFloat32(layer.weight);
      bufferWriter.writeUint16(states.length);
      states.forEach((state) => {
        const { transitions } = state;
        bufferWriter.writeStr(state.name);
        bufferWriter.writeFloat32(state.speed);
        bufferWriter.writeUint8(state.wrapMode);
        bufferWriter.writeUint8(state.isDefaultState ? 1 : 0);
        bufferWriter.writeFloat32(state.clipStartNormalizedTime);
        bufferWriter.writeFloat32(state.clipEndNormalizedTime);
        bufferWriter.writeStr(state.clip.path);
        bufferWriter.writeStr(state.clip.objectId);
        bufferWriter.writeUint16(transitions.length);
        transitions.forEach((transition) => {
          bufferWriter.writeFloat32(transition.duration);
          bufferWriter.writeFloat32(transition.offset);
          bufferWriter.writeFloat32(transition.exitTime);
          bufferWriter.writeStr(transition.targetStateName);
        });
      });
    });

    return bufferWriter.buffer;
  }
}
