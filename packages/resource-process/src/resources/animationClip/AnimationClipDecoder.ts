import { Quaternion } from "@oasis-engine/math";
import {
  AnimationClip,
  AnimationCurve,
  AnimationEvent,
  Component,
  Engine,
  Entity,
  InterpolableKeyframe,
  InterpolableValueType,
  SkinnedMeshRenderer,
  Transform
} from "@oasis-engine/core";
import { Vector2, Vector3, Vector4 } from "@oasis-engine/math";
import type { BufferReader } from "../../utils/BufferReader";
import { decoder } from "../../utils/Decorator";
import { ComponentClass, PropertyNameMap } from "./type";

@decoder("AnimationClip")
export class AnimationClipDecoder {
  public static decode(engine: Engine, bufferReader: BufferReader): Promise<AnimationClip> {
    return new Promise((resolve) => {
      const name = bufferReader.nextStr();
      const clip = new AnimationClip(name);
      const eventsLen = bufferReader.nextUint16();
      for (let i = 0; i < eventsLen; ++i) {
        const event = new AnimationEvent();
        event.time = bufferReader.nextFloat32();
        event.functionName = bufferReader.nextStr();
        const param = bufferReader.nextStr();
        event.parameter = JSON.parse(param).val;
        clip.addEvent(event);
      }

      const curveBindingsLen = bufferReader.nextUint16();
      for (let i = 0; i < curveBindingsLen; ++i) {
        const relativePath = bufferReader.nextStr();
        const componentClass: ComponentClass = bufferReader.nextUint8();
        let compType: new (entity: Entity) => Component;
        switch (componentClass) {
          case ComponentClass.Transform:
            compType = Transform;
            break;
          case ComponentClass.SkinnedMeshRenderer:
            compType = SkinnedMeshRenderer;
            break;
        }
        const property = bufferReader.nextUint8();
        const curve = new AnimationCurve();
        curve.interpolation = bufferReader.nextUint8();
        const keysLen = bufferReader.nextUint16();
        for (let j = 0; j < keysLen; ++j) {
          const type = bufferReader.nextUint8();
          switch (type) {
            case InterpolableValueType.Float: {
              const keyframe = new InterpolableKeyframe<number, number>();
              keyframe.time = bufferReader.nextFloat32();
              keyframe.value = bufferReader.nextFloat32();
              keyframe.inTangent = bufferReader.nextFloat32();
              keyframe.outTangent = bufferReader.nextFloat32();
              curve.addKey(keyframe);
              break;
            }
            case InterpolableValueType.FloatArray: {
              const keyframe = new InterpolableKeyframe<Float32Array, Float32Array>();
              keyframe.time = bufferReader.nextFloat32();
              const len = bufferReader.nextUint16();
              keyframe.value = bufferReader.nextFloat32Array(len);
              keyframe.inTangent = bufferReader.nextFloat32Array(len);
              keyframe.outTangent = bufferReader.nextFloat32Array(len);
              curve.addKey(keyframe);
              break;
            }
            case InterpolableValueType.Vector2: {
              const keyframe = new InterpolableKeyframe<Vector2, Vector2>();
              keyframe.time = bufferReader.nextFloat32();
              keyframe.value = new Vector2(bufferReader.nextFloat32(), bufferReader.nextFloat32());
              keyframe.inTangent = new Vector2(bufferReader.nextFloat32(), bufferReader.nextFloat32());
              keyframe.outTangent = new Vector2(bufferReader.nextFloat32(), bufferReader.nextFloat32());
              curve.addKey(keyframe);
              break;
            }
            case InterpolableValueType.Vector3: {
              const keyframe = new InterpolableKeyframe<Vector3, Vector3>();
              keyframe.time = bufferReader.nextFloat32();
              keyframe.value = new Vector3(
                bufferReader.nextFloat32(),
                bufferReader.nextFloat32(),
                bufferReader.nextFloat32()
              );
              keyframe.inTangent = new Vector3(
                bufferReader.nextFloat32(),
                bufferReader.nextFloat32(),
                bufferReader.nextFloat32()
              );
              keyframe.outTangent = new Vector3(
                bufferReader.nextFloat32(),
                bufferReader.nextFloat32(),
                bufferReader.nextFloat32()
              );
              curve.addKey(keyframe);
              break;
            }
            case InterpolableValueType.Vector4: {
              const keyframe = new InterpolableKeyframe<Vector4, Vector4>();
              keyframe.time = bufferReader.nextFloat32();
              keyframe.value = new Vector4(
                bufferReader.nextFloat32(),
                bufferReader.nextFloat32(),
                bufferReader.nextFloat32(),
                bufferReader.nextFloat32()
              );
              keyframe.inTangent = new Vector4(
                bufferReader.nextFloat32(),
                bufferReader.nextFloat32(),
                bufferReader.nextFloat32(),
                bufferReader.nextFloat32()
              );
              keyframe.outTangent = new Vector4(
                bufferReader.nextFloat32(),
                bufferReader.nextFloat32(),
                bufferReader.nextFloat32(),
                bufferReader.nextFloat32()
              );
              curve.addKey(keyframe);
              break;
            }
            case InterpolableValueType.Quaternion: {
              const keyframe = new InterpolableKeyframe<Vector4, Quaternion>();
              keyframe.time = bufferReader.nextFloat32();
              keyframe.value = new Quaternion(
                bufferReader.nextFloat32(),
                bufferReader.nextFloat32(),
                bufferReader.nextFloat32(),
                bufferReader.nextFloat32()
              );
              keyframe.inTangent = new Vector4(
                bufferReader.nextFloat32(),
                bufferReader.nextFloat32(),
                bufferReader.nextFloat32(),
                bufferReader.nextFloat32()
              );
              keyframe.outTangent = new Vector4(
                bufferReader.nextFloat32(),
                bufferReader.nextFloat32(),
                bufferReader.nextFloat32(),
                bufferReader.nextFloat32()
              );
              curve.addKey(keyframe);
              break;
            }
          }
        }
        clip.addCurveBinding(relativePath, compType, PropertyNameMap[property], curve);
      }

      resolve(clip);
    });
  }
}
