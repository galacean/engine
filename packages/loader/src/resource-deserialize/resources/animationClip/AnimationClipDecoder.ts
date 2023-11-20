import {
  AnimationArrayCurve,
  AnimationClip,
  AnimationColorCurve,
  AnimationCurve,
  AnimationEvent,
  AnimationFloatArrayCurve,
  AnimationFloatCurve,
  AnimationQuaternionCurve,
  AnimationVector2Curve,
  AnimationVector3Curve,
  AnimationVector4Curve,
  AnimationRefCurve,
  Engine,
  Keyframe,
  KeyframeValueType,
  ReferResource,
  AnimationObjectCurve,
  AnimationStringCurve,
  AnimationBoolCurve,
  AnimationMethodCurve
} from "@galacean/engine-core";
import { Color, Quaternion, Vector2, Vector3, Vector4 } from "@galacean/engine-math";
import type { BufferReader } from "../../utils/BufferReader";
import { decoder } from "../../utils/Decorator";
import { ComponentMap } from "./ComponentMap";

export { ComponentMap } from "./ComponentMap";

export enum InterpolableValueType {
  Float,
  FloatArray,
  Vector2,
  Vector3,
  Vector4,
  Quaternion,
  Color,
  Array,
  Boolean,
  Rect,
  ReferResource
}

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
        event.parameter = JSON.parse(bufferReader.nextStr()).val;
        clip.addEvent(event);
      }

      const curveBindingsLen = bufferReader.nextUint16();
      for (let i = 0; i < curveBindingsLen; ++i) {
        const relativePath = bufferReader.nextStr();
        const componentStr = bufferReader.nextStr();
        const componentType = ComponentMap[componentStr];
        const property = bufferReader.nextStr();
        let curve: AnimationCurve<KeyframeValueType>;
        const interpolation = bufferReader.nextUint8();
        const keysLen = bufferReader.nextUint16();
        const curveType = bufferReader.nextStr();
        switch (curveType) {
          case "AnimationFloatCurve": {
            curve = new AnimationFloatCurve();
            curve.interpolation = interpolation;
            for (let j = 0; j < keysLen; ++j) {
              const keyframe = new Keyframe<number>();
              keyframe.time = bufferReader.nextFloat32();
              keyframe.value = bufferReader.nextFloat32();
              keyframe.inTangent = bufferReader.nextFloat32();
              keyframe.outTangent = bufferReader.nextFloat32();
              (<AnimationFloatCurve>curve).addKey(keyframe);
            }
            break;
          }
          case "AnimationArrayCurve": {
            curve = new AnimationArrayCurve();
            curve.interpolation = interpolation;
            for (let j = 0; j < keysLen; ++j) {
              const keyframe = new Keyframe<number[]>();
              keyframe.time = bufferReader.nextFloat32();
              const len = bufferReader.nextUint16();
              keyframe.value = Array.from(bufferReader.nextFloat32Array(len));
              keyframe.inTangent = Array.from(bufferReader.nextFloat32Array(len));
              keyframe.outTangent = Array.from(bufferReader.nextFloat32Array(len));
              (<AnimationArrayCurve>curve).addKey(keyframe);
            }
            break;
          }
          case "AnimationFloatArrayCurve": {
            curve = new AnimationFloatArrayCurve();
            curve.interpolation = interpolation;
            for (let j = 0; j < keysLen; ++j) {
              const keyframe = new Keyframe<Float32Array>();
              keyframe.time = bufferReader.nextFloat32();
              const len = bufferReader.nextUint16();
              keyframe.value = bufferReader.nextFloat32Array(len);
              keyframe.inTangent = Array.from(bufferReader.nextFloat32Array(len));
              keyframe.outTangent = Array.from(bufferReader.nextFloat32Array(len));
              (<AnimationFloatArrayCurve>curve).addKey(keyframe);
            }
            break;
          }
          case "AnimationVector2Curve": {
            curve = new AnimationVector2Curve();
            curve.interpolation = interpolation;
            for (let j = 0; j < keysLen; ++j) {
              const keyframe = new Keyframe<Vector2>();
              keyframe.time = bufferReader.nextFloat32();
              keyframe.value = new Vector2(bufferReader.nextFloat32(), bufferReader.nextFloat32());
              keyframe.inTangent = new Vector2(bufferReader.nextFloat32(), bufferReader.nextFloat32());
              keyframe.outTangent = new Vector2(bufferReader.nextFloat32(), bufferReader.nextFloat32());
              (<AnimationVector2Curve>curve).addKey(keyframe);
            }
            break;
          }
          case "AnimationVector3Curve": {
            curve = new AnimationVector3Curve();
            curve.interpolation = interpolation;
            for (let j = 0; j < keysLen; ++j) {
              const keyframe = new Keyframe<Vector3>();
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
              (<AnimationVector3Curve>curve).addKey(keyframe);
            }
            break;
          }
          case "AnimationVector4Curve": {
            curve = new AnimationVector4Curve();
            curve.interpolation = interpolation;
            const keyframe = new Keyframe<Vector4>();
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
            (<AnimationVector4Curve>curve).addKey(keyframe);
            break;
          }
          case "AnimationColorCurve": {
            curve = new AnimationColorCurve();
            curve.interpolation = interpolation;
            for (let j = 0; j < keysLen; ++j) {
              const keyframe = new Keyframe<Color>();
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
              (<AnimationColorCurve>curve).addKey(keyframe);
            }
            break;
          }
          case "AnimationQuaternionCurve": {
            curve = new AnimationQuaternionCurve();
            curve.interpolation = interpolation;
            for (let j = 0; j < keysLen; ++j) {
              const keyframe = new Keyframe<Quaternion>();
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
              (<AnimationQuaternionCurve>curve).addKey(keyframe);
            }
            break;
          }
          case "AnimationRefCurve": {
            curve = new AnimationRefCurve();
            curve.interpolation = interpolation;
            for (let j = 0; j < keysLen; ++j) {
              const keyframe = new Keyframe<ReferResource>();
              keyframe.time = bufferReader.nextFloat32();
              const str = bufferReader.nextStr();
              if (str) {
                keyframe.value = JSON.parse(str);
              } else {
                keyframe.value = null;
              }
              (<AnimationRefCurve>curve).addKey(keyframe);
            }
            break;
          }
          case "AnimationBoolCurve": {
            curve = new AnimationBoolCurve();
            curve.interpolation = interpolation;
            for (let j = 0; j < keysLen; ++j) {
              const keyframe = new Keyframe<boolean>();
              keyframe.time = bufferReader.nextFloat32();
              keyframe.value = bufferReader.nextUint8() === 1;
              (<AnimationBoolCurve>curve).addKey(keyframe);
            }
            break;
          }
          case "AnimationStringCurve": {
            curve = new AnimationStringCurve();
            curve.interpolation = interpolation;
            for (let j = 0; j < keysLen; ++j) {
              const keyframe = new Keyframe<string>();
              keyframe.time = bufferReader.nextFloat32();
              keyframe.value = bufferReader.nextStr();
              (<AnimationStringCurve>curve).addKey(keyframe);
            }
            break;
          }
          case "AnimationObjectCurve": {
            curve = new AnimationObjectCurve();
            curve.interpolation = interpolation;
            for (let j = 0; j < keysLen; ++j) {
              const keyframe = new Keyframe<Object>();
              keyframe.time = bufferReader.nextFloat32();
              const str = bufferReader.nextStr();
              keyframe.value = JSON.parse(str);
              (<AnimationObjectCurve>curve).addKey(keyframe);
            }
            break;
          }
          case "AnimationMethodCurve": {
            curve = new AnimationMethodCurve();
            curve.interpolation = interpolation;
            for (let j = 0; j < keysLen; ++j) {
              const keyframe = new Keyframe<Object>();
              keyframe.time = bufferReader.nextFloat32();
              const str = bufferReader.nextStr();
              keyframe.value = JSON.parse(str);
              (<AnimationMethodCurve>curve).addKey(keyframe);
            }
            break;
          }
        }
        clip.addCurveBinding(relativePath, componentType, property, curve);
      }
      resolve(clip);
    });
  }
}
