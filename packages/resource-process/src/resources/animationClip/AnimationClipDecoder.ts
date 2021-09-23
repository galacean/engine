import { Quaternion } from "@oasis-engine/math";
import {
  AnimationClip,
  AnimationCurve,
  AnimationEvent,
  Component,
  Engine,
  Entity,
  InterpolableKeyframe,
  SkinnedMeshRenderer,
  Transform
} from "@oasis-engine/core";
import { Vector2, Vector3, Vector4 } from "@oasis-engine/math";
import type { BufferReader } from "../../utils/BufferReader";
import { decoder } from "../../utils/Decorator";
import { ComponentClass, KeyframeValueType, PropertyNameMap } from "./type";

@decoder("AnimationClip")
export class AnimationClipDecoder {
  public static decode(engine: Engine, bufferReader: BufferReader): Promise<AnimationClip> {
    return new Promise((resolve) => {
      const objectId = bufferReader.nextStr();
      const name = bufferReader.nextStr();
      const clip = new AnimationClip(name);
      const eventsLen = bufferReader.nextUint16();

      for (let i = 0; i < eventsLen; ++i) {
        const event = new AnimationEvent();
        event.time = bufferReader.nextFloat32();
        event.functionName = bufferReader.nextStr();
        event.parameter = JSON.parse(bufferReader.nextStr()).val;
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
        for (let j = 0; i < keysLen; ++j) {
          const type = bufferReader.nextUint8();
          switch (type) {
            case KeyframeValueType.Number: {
              const keyframe = new InterpolableKeyframe<number, number>();
              keyframe.time = bufferReader.nextFloat32();
              keyframe.value = bufferReader.nextFloat32();
              keyframe.inTangent = bufferReader.nextFloat32();
              keyframe.outTangent = bufferReader.nextFloat32();
              curve.addKey(keyframe);
              break;
            }
            case KeyframeValueType.Float32Array: {
              const keyframe = new InterpolableKeyframe<Float32Array, Float32Array>();
              keyframe.time = bufferReader.nextFloat32();
              const len = bufferReader.nextUint16();
              keyframe.value = bufferReader.nextFloat32Array(len);
              keyframe.inTangent = bufferReader.nextFloat32Array(len);
              keyframe.outTangent = bufferReader.nextFloat32Array(len);
              curve.addKey(keyframe);
              break;
            }
            case KeyframeValueType.Vector2: {
              const keyframe = new InterpolableKeyframe<Vector2, Vector2>();
              keyframe.time = bufferReader.nextFloat32();
              keyframe.value = new Vector2(bufferReader.nextFloat32(), bufferReader.nextFloat32());
              keyframe.inTangent = new Vector2(bufferReader.nextFloat32(), bufferReader.nextFloat32());
              keyframe.outTangent = new Vector2(bufferReader.nextFloat32(), bufferReader.nextFloat32());
              curve.addKey(keyframe);
              break;
            }
            case KeyframeValueType.Vector3: {
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
            case KeyframeValueType.Vector4: {
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
            case KeyframeValueType.Quaternion: {
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
            case KeyframeValueType.Object: {
              const keyframe = new InterpolableKeyframe<Vector4, Quaternion>();
              keyframe.time = bufferReader.nextFloat32();
              keyframe.value = JSON.parse(bufferReader.nextStr()).val;
              keyframe.inTangent = JSON.parse(bufferReader.nextStr()).val;
              keyframe.outTangent = JSON.parse(bufferReader.nextStr()).val;
              curve.addKey(keyframe);
              break;
            }
          }
        }
        clip.addCurveBinding(relativePath, compType, PropertyNameMap[property], curve);
      }

      // @ts-ignore
      engine.resourceManager._objectPool[objectId] = clip;
      resolve(clip);
    });
  }
}
