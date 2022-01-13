import { AnimationProperty, InterpolableValueType } from "@oasis-engine/core";
import { BufferWriter } from "../../utils/BufferWriter";
import { encoder } from "../../utils/Decorator";
import { ComponentClass, IAnimationClipAsset } from "./type";

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
      const { curve, property } = curveBinding
      bufferWriter.writeStr(curveBinding.relativePath);
      let componentClass;
      switch (property) {
        case AnimationProperty.Position:
        case AnimationProperty.Rotation:
        case AnimationProperty.Scale:
          componentClass = ComponentClass.Transform;
          break;
        case AnimationProperty.BlendShapeWeights:
          componentClass = ComponentClass.SkinnedMeshRenderer;
        default:
          componentClass = ComponentClass.Other;
          break;
      }

      bufferWriter.writeUint8(componentClass);
      bufferWriter.writeUint8(property);
      bufferWriter.writeUint8(curve.interpolation);
      const { valueType, keys } = curve;
      bufferWriter.writeUint16(keys.length);
      keys.forEach((key) => {
        const { time, value, inTangent, outTangent } = key;
        bufferWriter.writeUint8(valueType);
        bufferWriter.writeFloat32(time);
        switch (valueType) {
          case InterpolableValueType.Float:
            bufferWriter.writeFloat32(value);
            bufferWriter.writeFloat32(inTangent);
            bufferWriter.writeFloat32(outTangent);
            break;
          case InterpolableValueType.FloatArray:
            bufferWriter.writeFloat32Array(value);
            bufferWriter.writeUint16(value.length);
            bufferWriter.writeFloat32Array(inTangent);
            bufferWriter.writeFloat32Array(outTangent);
            break;
          case InterpolableValueType.Vector2:
            bufferWriter.writeFloat32(value.x);
            bufferWriter.writeFloat32(value.y);
            bufferWriter.writeFloat32(inTangent.x);
            bufferWriter.writeFloat32(inTangent.y);
            bufferWriter.writeFloat32(outTangent.x);
            bufferWriter.writeFloat32(outTangent.y);
            break;
          case InterpolableValueType.Vector3:
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
          case InterpolableValueType.Vector4:
          case InterpolableValueType.Quaternion:
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
        }
      });
    });

    return bufferWriter.buffer;
  }
}
