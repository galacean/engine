import {
  AnimationArrayCurve,
  AnimationBoolCurve,
  AnimationClip,
  AnimationColorCurve,
  AnimationCurve,
  AnimationEvent,
  AnimationFloatArrayCurve,
  AnimationFloatCurve,
  AnimationQuaternionCurve,
  AnimationRefCurve,
  AnimationStringCurve,
  AnimationVector2Curve,
  AnimationVector3Curve,
  AnimationVector4Curve,
  AssetPromise,
  Engine,
  Keyframe,
  KeyframeValueType,
  Loader,
  ReferResource
} from "@galacean/engine-core";
import { Color, Quaternion, Vector2, Vector3, Vector4 } from "@galacean/engine-math";
import type { BufferReader } from "../../utils/BufferReader";
import { decoder } from "../../utils/Decorator";

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

const MAX_EVENTS = 65535;
const MAX_CURVE_BINDINGS = 65535;
const MAX_KEYFRAMES_PER_CURVE = 65535;
const MAX_TOTAL_KEYFRAMES = 1_000_000;
const MIN_EVENT_BYTES = 8;

const MIN_KEYFRAME_BYTES: Record<string, number> = Object.assign(Object.create(null), {
  AnimationFloatCurve: 16,
  AnimationArrayCurve: 6,
  AnimationFloatArrayCurve: 6,
  AnimationVector2Curve: 28,
  AnimationVector3Curve: 40,
  AnimationVector4Curve: 52,
  AnimationColorCurve: 52,
  AnimationQuaternionCurve: 52,
  AnimationRefCurve: 6,
  AnimationBoolCurve: 5,
  AnimationStringCurve: 6
});

function readFiniteTime(bufferReader: BufferReader, label: string): number {
  const time = bufferReader.nextFloat32();
  if (!Number.isFinite(time)) {
    throw new Error(`AnimationClipDecoder: invalid ${label} time.`);
  }
  return time;
}

@decoder("AnimationClip")
export class AnimationClipDecoder {
  public static decode(engine: Engine, bufferReader: BufferReader): AssetPromise<AnimationClip> {
    return new AssetPromise((resolve) => {
      const name = bufferReader.nextStr();
      const clip = new AnimationClip(name);
      const version = bufferReader.header?.version ?? 1;
      const eventsLen = bufferReader.nextUint16();
      if (eventsLen > MAX_EVENTS || eventsLen * MIN_EVENT_BYTES > bufferReader.remaining) {
        throw new Error(`AnimationClipDecoder: invalid event count ${eventsLen}.`);
      }
      if (eventsLen > 0) {
        const events = new Array<AnimationEvent>(eventsLen);
        for (let i = 0; i < eventsLen; ++i) {
          const event = new AnimationEvent();
          event.time = readFiniteTime(bufferReader, "event");
          event.functionName = bufferReader.nextStr();
          event.parameter = JSON.parse(bufferReader.nextStr()).val;
          events[i] = event;
        }
        clip._addEvents(events);
      }

      const curveBindingsLen = bufferReader.nextUint16();
      const minBindingBytes = version >= 2 ? 15 : 13;
      if (curveBindingsLen > MAX_CURVE_BINDINGS || curveBindingsLen * minBindingBytes > bufferReader.remaining) {
        throw new Error(`AnimationClipDecoder: invalid curve binding count ${curveBindingsLen}.`);
      }

      let totalKeyframes = 0;
      for (let i = 0; i < curveBindingsLen; ++i) {
        const relativePath = bufferReader.nextStr();
        const componentStr = bufferReader.nextStr();
        const componentType = Loader.getClass(componentStr);
        const typeIndex = version >= 2 ? bufferReader.nextUint16() : 0;
        const property = bufferReader.nextStr();
        const getProperty = bufferReader.nextStr();
        let curve: AnimationCurve<KeyframeValueType>;
        const interpolation = bufferReader.nextUint8();
        const keysLen = bufferReader.nextUint16();
        const curveType = bufferReader.nextStr();
        const minKeyBytes = MIN_KEYFRAME_BYTES[curveType];
        if (minKeyBytes === undefined) {
          throw new Error(`AnimationClipDecoder: unsupported curve type "${curveType}".`);
        }
        totalKeyframes += keysLen;
        if (
          keysLen > MAX_KEYFRAMES_PER_CURVE ||
          totalKeyframes > MAX_TOTAL_KEYFRAMES ||
          keysLen * minKeyBytes > bufferReader.remaining
        ) {
          throw new Error(`AnimationClipDecoder: keyframe count ${keysLen} exceeds bounds.`);
        }

        switch (curveType) {
          case "AnimationFloatCurve": {
            curve = new AnimationFloatCurve();
            curve.interpolation = interpolation;
            const keys = curve.keys;
            keys.length = keysLen;
            for (let j = 0; j < keysLen; ++j) {
              const keyframe = new Keyframe<number>();
              keyframe.time = readFiniteTime(bufferReader, "keyframe");
              keyframe.value = bufferReader.nextFloat32();
              keyframe.inTangent = bufferReader.nextFloat32();
              keyframe.outTangent = bufferReader.nextFloat32();
              keys[j] = keyframe;
            }
            break;
          }
          case "AnimationArrayCurve": {
            curve = new AnimationArrayCurve();
            curve.interpolation = interpolation;
            const keys = curve.keys;
            keys.length = keysLen;
            for (let j = 0; j < keysLen; ++j) {
              const keyframe = new Keyframe<number[]>();
              keyframe.time = readFiniteTime(bufferReader, "keyframe");
              const len = bufferReader.nextUint16();
              if (len * 12 > bufferReader.remaining) {
                throw new Error(`AnimationClipDecoder: array keyframe length ${len} exceeds bounds.`);
              }
              keyframe.value = Array.from(bufferReader.nextFloat32Array(len));
              keyframe.inTangent = Array.from(bufferReader.nextFloat32Array(len));
              keyframe.outTangent = Array.from(bufferReader.nextFloat32Array(len));
              keys[j] = keyframe;
            }
            break;
          }
          case "AnimationFloatArrayCurve": {
            curve = new AnimationFloatArrayCurve();
            curve.interpolation = interpolation;
            const keys = curve.keys;
            keys.length = keysLen;
            for (let j = 0; j < keysLen; ++j) {
              const keyframe = new Keyframe<Float32Array>();
              keyframe.time = readFiniteTime(bufferReader, "keyframe");
              const len = bufferReader.nextUint16();
              if (len * 12 > bufferReader.remaining) {
                throw new Error(`AnimationClipDecoder: array keyframe length ${len} exceeds bounds.`);
              }
              keyframe.value = bufferReader.nextFloat32Array(len);
              keyframe.inTangent = Array.from(bufferReader.nextFloat32Array(len));
              keyframe.outTangent = Array.from(bufferReader.nextFloat32Array(len));
              keys[j] = keyframe;
            }
            break;
          }
          case "AnimationVector2Curve": {
            curve = new AnimationVector2Curve();
            curve.interpolation = interpolation;
            const keys = curve.keys;
            keys.length = keysLen;
            for (let j = 0; j < keysLen; ++j) {
              const keyframe = new Keyframe<Vector2>();
              keyframe.time = readFiniteTime(bufferReader, "keyframe");
              keyframe.value = new Vector2(bufferReader.nextFloat32(), bufferReader.nextFloat32());
              keyframe.inTangent = new Vector2(bufferReader.nextFloat32(), bufferReader.nextFloat32());
              keyframe.outTangent = new Vector2(bufferReader.nextFloat32(), bufferReader.nextFloat32());
              keys[j] = keyframe;
            }
            break;
          }
          case "AnimationVector3Curve": {
            curve = new AnimationVector3Curve();
            curve.interpolation = interpolation;
            const keys = curve.keys;
            keys.length = keysLen;
            for (let j = 0; j < keysLen; ++j) {
              const keyframe = new Keyframe<Vector3>();
              keyframe.time = readFiniteTime(bufferReader, "keyframe");
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
              keys[j] = keyframe;
            }
            break;
          }
          case "AnimationVector4Curve": {
            curve = new AnimationVector4Curve();
            curve.interpolation = interpolation;
            const keys = curve.keys;
            keys.length = keysLen;
            for (let j = 0; j < keysLen; ++j) {
              const keyframe = new Keyframe<Vector4>();
              keyframe.time = readFiniteTime(bufferReader, "keyframe");
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
              keys[j] = keyframe;
            }
            break;
          }
          case "AnimationColorCurve": {
            curve = new AnimationColorCurve();
            curve.interpolation = interpolation;
            const keys = curve.keys;
            keys.length = keysLen;
            for (let j = 0; j < keysLen; ++j) {
              const keyframe = new Keyframe<Color>();
              keyframe.time = readFiniteTime(bufferReader, "keyframe");
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
              keys[j] = keyframe;
            }
            break;
          }
          case "AnimationQuaternionCurve": {
            curve = new AnimationQuaternionCurve();
            curve.interpolation = interpolation;
            const keys = curve.keys;
            keys.length = keysLen;
            for (let j = 0; j < keysLen; ++j) {
              const keyframe = new Keyframe<Quaternion>();
              keyframe.time = readFiniteTime(bufferReader, "keyframe");
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
              keys[j] = keyframe;
            }
            break;
          }
          case "AnimationRefCurve": {
            curve = new AnimationRefCurve();
            curve.interpolation = interpolation;
            const keys = curve.keys;
            keys.length = keysLen;
            for (let j = 0; j < keysLen; ++j) {
              const keyframe = new Keyframe<ReferResource | null>();
              keyframe.time = readFiniteTime(bufferReader, "keyframe");
              const str = bufferReader.nextStr();
              if (str) {
                keyframe.value = JSON.parse(str);
              } else {
                keyframe.value = null;
              }
              keys[j] = keyframe;
            }
            break;
          }
          case "AnimationBoolCurve": {
            curve = new AnimationBoolCurve();
            curve.interpolation = interpolation;
            const keys = curve.keys;
            keys.length = keysLen;
            for (let j = 0; j < keysLen; ++j) {
              const keyframe = new Keyframe<boolean>();
              keyframe.time = readFiniteTime(bufferReader, "keyframe");
              keyframe.value = bufferReader.nextUint8() === 1;
              keys[j] = keyframe;
            }
            break;
          }
          case "AnimationStringCurve": {
            curve = new AnimationStringCurve();
            curve.interpolation = interpolation;
            const keys = curve.keys;
            keys.length = keysLen;
            for (let j = 0; j < keysLen; ++j) {
              const keyframe = new Keyframe<string>();
              keyframe.time = readFiniteTime(bufferReader, "keyframe");
              keyframe.value = bufferReader.nextStr();
              keys[j] = keyframe;
            }
            break;
          }
        }
        curve!._addKeys(curve!.keys);
        clip.addCurveBinding(relativePath, componentType, typeIndex, property, getProperty, curve!);
      }
      resolve(clip);
    });
  }
}
