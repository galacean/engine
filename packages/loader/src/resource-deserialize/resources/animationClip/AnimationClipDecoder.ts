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
  KeyframeValueType,
  Loader,
  ReferResource,
  TypedArray
} from "@galacean/engine-core";
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

@decoder("AnimationClip")
export class AnimationClipDecoder {
  public static decode(engine: Engine, bufferReader: BufferReader): AssetPromise<AnimationClip> {
    return new AssetPromise((resolve) => {
      const name = bufferReader.nextStr();
      const clip = new AnimationClip(name);
      const version = bufferReader.header?.version ?? 1;
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
        const componentType = Loader.getClass(componentStr);
        const typeIndex = version >= 2 ? bufferReader.nextUint16() : 0;
        const property = bufferReader.nextStr();
        const getProperty = bufferReader.nextStr();
        let curve!: AnimationCurve<KeyframeValueType>;
        const interpolation = bufferReader.nextUint8();
        const keysLen = bufferReader.nextUint16();
        const curveType = bufferReader.nextStr();
        switch (curveType) {
          case "AnimationFloatCurve":
            curve = new AnimationFloatCurve();
            AnimationClipDecoder._decodeFixedNumericCurve(<AnimationFloatCurve>curve, bufferReader, keysLen, 1);
            break;
          case "AnimationArrayCurve":
            curve = new AnimationArrayCurve();
            AnimationClipDecoder._decodeVariableNumericCurve(<AnimationArrayCurve>curve, bufferReader, keysLen);
            break;
          case "AnimationFloatArrayCurve":
            curve = new AnimationFloatArrayCurve();
            AnimationClipDecoder._decodeVariableNumericCurve(<AnimationFloatArrayCurve>curve, bufferReader, keysLen);
            break;
          case "AnimationVector2Curve":
            curve = new AnimationVector2Curve();
            AnimationClipDecoder._decodeFixedNumericCurve(<AnimationVector2Curve>curve, bufferReader, keysLen, 2);
            break;
          case "AnimationVector3Curve":
            curve = new AnimationVector3Curve();
            AnimationClipDecoder._decodeFixedNumericCurve(<AnimationVector3Curve>curve, bufferReader, keysLen, 3);
            break;
          case "AnimationVector4Curve":
            curve = new AnimationVector4Curve();
            AnimationClipDecoder._decodeFixedNumericCurve(<AnimationVector4Curve>curve, bufferReader, keysLen, 4);
            break;
          case "AnimationColorCurve":
            curve = new AnimationColorCurve();
            AnimationClipDecoder._decodeFixedNumericCurve(<AnimationColorCurve>curve, bufferReader, keysLen, 4);
            break;
          case "AnimationQuaternionCurve":
            curve = new AnimationQuaternionCurve();
            AnimationClipDecoder._decodeFixedNumericCurve(<AnimationQuaternionCurve>curve, bufferReader, keysLen, 4);
            break;
          case "AnimationRefCurve": {
            curve = new AnimationRefCurve();
            if (keysLen > 0) {
              const times = new Float32Array(keysLen);
              const values = new Array<ReferResource | null>(keysLen);
              for (let j = 0; j < keysLen; ++j) {
                times[j] = bufferReader.nextFloat32();
                const str = bufferReader.nextStr();
                values[j] = str ? JSON.parse(str) : null;
              }
              (<AnimationRefCurve>curve).setKeys(times, values);
            }
            break;
          }
          case "AnimationBoolCurve": {
            curve = new AnimationBoolCurve();
            if (keysLen > 0) {
              const times = new Float32Array(keysLen);
              const values = new Array<boolean>(keysLen);
              for (let j = 0; j < keysLen; ++j) {
                times[j] = bufferReader.nextFloat32();
                values[j] = bufferReader.nextUint8() === 1;
              }
              (<AnimationBoolCurve>curve).setKeys(times, values);
            }
            break;
          }
          case "AnimationStringCurve": {
            curve = new AnimationStringCurve();
            if (keysLen > 0) {
              const times = new Float32Array(keysLen);
              const values = new Array<string>(keysLen);
              for (let j = 0; j < keysLen; ++j) {
                times[j] = bufferReader.nextFloat32();
                values[j] = bufferReader.nextStr();
              }
              (<AnimationStringCurve>curve).setKeys(times, values);
            }
            break;
          }
        }
        curve.interpolation = interpolation;
        clip.addCurveBinding(relativePath, componentType, typeIndex, property, getProperty, curve);
      }
      resolve(clip);
    });
  }

  private static _decodeFixedNumericCurve(
    curve: NumericSetKeysCurve,
    bufferReader: BufferReader,
    keysLen: number,
    valueSize: number
  ): void {
    if (keysLen === 0) {
      return;
    }
    const times = new Float32Array(keysLen);
    const stride = valueSize * 3;
    const values = new Float32Array(keysLen * stride);
    for (let j = 0, base = 0; j < keysLen; ++j, base += stride) {
      times[j] = bufferReader.nextFloat32();
      AnimationClipDecoder._readFloatTriple(bufferReader, values, base, valueSize);
    }
    curve.setKeys(times, values, true);
  }

  private static _decodeVariableNumericCurve(
    curve: NumericSetKeysCurve,
    bufferReader: BufferReader,
    keysLen: number
  ): void {
    if (keysLen === 0) {
      return;
    }
    const times = new Float32Array(keysLen);
    times[0] = bufferReader.nextFloat32();
    const valueSize = bufferReader.nextUint16();
    const stride = valueSize * 3;
    const values = new Float32Array(keysLen * stride);

    AnimationClipDecoder._readFloatTriple(bufferReader, values, 0, valueSize);
    for (let j = 1, base = stride; j < keysLen; ++j, base += stride) {
      times[j] = bufferReader.nextFloat32();
      const len = bufferReader.nextUint16();
      if (len !== valueSize) {
        throw new Error(`AnimationClipDecoder: inconsistent array keyframe length ${len} (expected ${valueSize}).`);
      }
      AnimationClipDecoder._readFloatTriple(bufferReader, values, base, valueSize);
    }
    curve.setKeys(times, values, true);
  }

  private static _readFloatTriple(
    bufferReader: BufferReader,
    values: Float32Array,
    base: number,
    valueSize: number
  ): void {
    // Binary .anim stream stores [value, inTangent, outTangent]; curve storage expects [inTangent, value, outTangent].
    const valueOffset = base + valueSize;
    for (let k = 0; k < valueSize; ++k) {
      values[valueOffset + k] = bufferReader.nextFloat32();
    }
    for (let k = 0; k < valueSize; ++k) {
      values[base + k] = bufferReader.nextFloat32();
    }
    const outOffset = valueOffset + valueSize;
    for (let k = 0; k < valueSize; ++k) {
      values[outOffset + k] = bufferReader.nextFloat32();
    }
  }
}

interface NumericSetKeysCurve {
  setKeys(times: TypedArray, values: TypedArray, hasTangents?: boolean): void;
}
