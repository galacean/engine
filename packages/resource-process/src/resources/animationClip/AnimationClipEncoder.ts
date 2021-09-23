import { BufferWriter } from "../../utils/BufferWriter";
import { encoder } from "../../utils/Decorator";
import { KeyframeValueType } from "./type";
import type { IAnimationClipAsset } from "./type";

@encoder("AnimationClip")
export class AnimationClipEncoder {
  static encode(bufferWriter: BufferWriter, data: IAnimationClipAsset) {
    const { objectId, name, events, curveBindings } = data;

    bufferWriter.writeStr(objectId);
    bufferWriter.writeStr(name);
    bufferWriter.writeUint16(events.length);
    events.forEach((event) => {
      bufferWriter.writeFloat32(event.time);
      bufferWriter.writeStr(event.functionName);
      bufferWriter.writeStr(JSON.stringify({ val: event.parameter }));
    });

    bufferWriter.writeUint16(curveBindings.length);
    curveBindings.forEach((curveBinding) => {
      const { curve } = curveBinding
      bufferWriter.writeStr(curveBinding.relativePath);
      bufferWriter.writeUint8(curveBinding.componentClass);
      bufferWriter.writeUint8(curveBinding.property);
      bufferWriter.writeUint8(curve.interpolation);
      const { keys } = curve;
      bufferWriter.writeUint16(keys.length);
      keys.forEach((key) => {
        const { type, time, value, inTangent, outTangent } = key;
        bufferWriter.writeUint8(type);
        bufferWriter.writeFloat32(time);
        switch (type) {
          case KeyframeValueType.Number:
            bufferWriter.writeFloat32(value);
            bufferWriter.writeFloat32(inTangent);
            bufferWriter.writeFloat32(outTangent);
            break;
          case KeyframeValueType.Float32Array:
            bufferWriter.writeFloat32Array(value);
            bufferWriter.writeUint16(value.length);
            bufferWriter.writeFloat32Array(inTangent);
            bufferWriter.writeFloat32Array(outTangent);
            break;
          case KeyframeValueType.Vector2:
            bufferWriter.writeFloat32(value.x);
            bufferWriter.writeFloat32(value.y);
            bufferWriter.writeFloat32(inTangent.x);
            bufferWriter.writeFloat32(inTangent.y);
            bufferWriter.writeFloat32(outTangent.x);
            bufferWriter.writeFloat32(outTangent.y);
            break;
          case KeyframeValueType.Vector3:
            bufferWriter.writeFloat32(value.x);
            bufferWriter.writeFloat32(value.y);
            bufferWriter.writeFloat32(value.z);
            bufferWriter.writeFloat32(inTangent.x);
            bufferWriter.writeFloat32(inTangent.y);
            bufferWriter.writeFloat32(inTangent.z);
            bufferWriter.writeFloat32(outTangent.x);
            bufferWriter.writeFloat32(outTangent.y);
            bufferWriter.writeFloat32(outTangent.z);
            break;
          case KeyframeValueType.Vector4:
          case KeyframeValueType.Quaternion:
            bufferWriter.writeFloat32(value.x);
            bufferWriter.writeFloat32(value.y);
            bufferWriter.writeFloat32(value.z);
            bufferWriter.writeFloat32(value.w);
            bufferWriter.writeFloat32(inTangent.x);
            bufferWriter.writeFloat32(inTangent.y);
            bufferWriter.writeFloat32(inTangent.z);
            bufferWriter.writeFloat32(inTangent.w);
            bufferWriter.writeFloat32(outTangent.x);
            bufferWriter.writeFloat32(outTangent.y);
            bufferWriter.writeFloat32(outTangent.z);
            bufferWriter.writeFloat32(outTangent.w);
            break;
          case KeyframeValueType.Object:
            bufferWriter.writeStr(JSON.stringify({ val: value }));
            bufferWriter.writeStr(JSON.stringify({ val: inTangent }));
            bufferWriter.writeStr(JSON.stringify({ val: outTangent }));
            break;
        }
      });
    });
  }
}
