import {
  AnimationClip,
  AnimationCurve,
  AnimationCurveFactory,
  AnimationEvent,
  ArrayKeyframe,
  ColorKeyframe,
  Component,
  Engine,
  Entity,
  FloatArrayKeyframe,
  FloatKeyframe,
  InterpolableValueType,
  QuaternionKeyframe,
  SkinnedMeshRenderer,
  Transform,
  Vector2Keyframe,
  Vector3Keyframe,
  Vector4Keyframe
} from "@oasis-engine/core";
import { Color, Quaternion, Vector2, Vector3, Vector4 } from "@oasis-engine/math";
import type { BufferReader } from "../../utils/BufferReader";
import { decoder } from "../../utils/Decorator";
import { ComponentClass, PropertyNameMap } from "./type";

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
        let curve: AnimationCurve;
        const interpolation = bufferReader.nextUint8();
        const keysLen = bufferReader.nextUint16();
        for (let j = 0; j < keysLen; ++j) {
          const type = bufferReader.nextUint8();
          switch (type) {
            case InterpolableValueType.Float: {
              curve = AnimationCurveFactory.create(InterpolableValueType.Float);
              curve.interpolation = interpolation;
              const keyframe = new FloatKeyframe();
              keyframe.time = bufferReader.nextFloat32();
              keyframe.value = bufferReader.nextFloat32();
              keyframe.inTangent = bufferReader.nextFloat32();
              keyframe.outTangent = bufferReader.nextFloat32();
              curve.addKey(keyframe);
              break;
            }
            case InterpolableValueType.FloatArray: {
              curve = AnimationCurveFactory.create(InterpolableValueType.FloatArray);
              curve.interpolation = interpolation;
              const keyframe = new FloatArrayKeyframe();
              keyframe.time = bufferReader.nextFloat32();
              const len = bufferReader.nextUint16();
              keyframe.value = bufferReader.nextFloat32Array(len);
              keyframe.inTangent = bufferReader.nextFloat32Array(len);
              keyframe.outTangent = bufferReader.nextFloat32Array(len);
              curve.addKey(keyframe);
              break;
            }
            case InterpolableValueType.Array: {
              curve = AnimationCurveFactory.create(InterpolableValueType.Array);
              curve.interpolation = interpolation;
              const keyframe = new ArrayKeyframe();
              keyframe.time = bufferReader.nextFloat32();
              const len = bufferReader.nextUint16();
              keyframe.value = Array.from(bufferReader.nextFloat32Array(len));
              keyframe.inTangent = Array.from(bufferReader.nextFloat32Array(len));
              keyframe.outTangent = Array.from(bufferReader.nextFloat32Array(len));
              curve.addKey(keyframe);
              break;
            }
            case InterpolableValueType.Vector2: {
              curve = AnimationCurveFactory.create(InterpolableValueType.Vector2);
              curve.interpolation = interpolation;
              const keyframe = new Vector2Keyframe();
              keyframe.time = bufferReader.nextFloat32();
              keyframe.value = new Vector2(bufferReader.nextFloat32(), bufferReader.nextFloat32());
              keyframe.inTangent = new Vector2(bufferReader.nextFloat32(), bufferReader.nextFloat32());
              keyframe.outTangent = new Vector2(bufferReader.nextFloat32(), bufferReader.nextFloat32());
              curve.addKey(keyframe);
              break;
            }
            case InterpolableValueType.Vector3: {
              curve = AnimationCurveFactory.create(InterpolableValueType.Vector3);
              curve.interpolation = interpolation;
              const keyframe = new Vector3Keyframe();
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
              curve = AnimationCurveFactory.create(InterpolableValueType.Vector4);
              curve.interpolation = interpolation;
              const keyframe = new Vector4Keyframe();
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
            case InterpolableValueType.Color: {
              curve = AnimationCurveFactory.create(InterpolableValueType.Color);
              curve.interpolation = interpolation;
              const keyframe = new ColorKeyframe();
              keyframe.time = bufferReader.nextFloat32();
              keyframe.value = new Color(
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
              curve = AnimationCurveFactory.create(InterpolableValueType.Quaternion);
              curve.interpolation = interpolation;
              const keyframe = new QuaternionKeyframe();
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

      // @ts-ignore
      engine.resourceManager._objectPool[objectId] = clip;
      resolve(clip);
    });
  }
}
