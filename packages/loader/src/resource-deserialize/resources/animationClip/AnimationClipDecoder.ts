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
  ReferResource
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
        let curve: AnimationCurve<KeyframeValueType>;
        const interpolation = bufferReader.nextUint8();
        const keysLen = bufferReader.nextUint16();
        const curveType = bufferReader.nextStr();
        switch (curveType) {
          case "AnimationFloatCurve": {
            curve = new AnimationFloatCurve();
            curve.interpolation = interpolation;
            if (keysLen > 0) {
              const { times, values } = AnimationClipDecoder._readFixedNumericKeys(bufferReader, keysLen, 1);
              (<AnimationFloatCurve>curve).setKeys(times, values, true);
            }
            break;
          }
          case "AnimationArrayCurve": {
            curve = new AnimationArrayCurve();
            curve.interpolation = interpolation;
            const decoded = AnimationClipDecoder._readVariableNumericKeys(bufferReader, keysLen);
            if (decoded) {
              (<AnimationArrayCurve>curve).setKeys(decoded.times, decoded.values, true);
            }
            break;
          }
          case "AnimationFloatArrayCurve": {
            curve = new AnimationFloatArrayCurve();
            curve.interpolation = interpolation;
            const decoded = AnimationClipDecoder._readVariableNumericKeys(bufferReader, keysLen);
            if (decoded) {
              (<AnimationFloatArrayCurve>curve).setKeys(decoded.times, decoded.values, true);
            }
            break;
          }
          case "AnimationVector2Curve": {
            curve = new AnimationVector2Curve();
            curve.interpolation = interpolation;
            if (keysLen > 0) {
              const { times, values } = AnimationClipDecoder._readFixedNumericKeys(bufferReader, keysLen, 2);
              (<AnimationVector2Curve>curve).setKeys(times, values, true);
            }
            break;
          }
          case "AnimationVector3Curve": {
            curve = new AnimationVector3Curve();
            curve.interpolation = interpolation;
            if (keysLen > 0) {
              const { times, values } = AnimationClipDecoder._readFixedNumericKeys(bufferReader, keysLen, 3);
              (<AnimationVector3Curve>curve).setKeys(times, values, true);
            }
            break;
          }
          case "AnimationVector4Curve": {
            curve = new AnimationVector4Curve();
            curve.interpolation = interpolation;
            if (keysLen > 0) {
              const { times, values } = AnimationClipDecoder._readFixedNumericKeys(bufferReader, keysLen, 4);
              (<AnimationVector4Curve>curve).setKeys(times, values, true);
            }
            break;
          }
          case "AnimationColorCurve": {
            curve = new AnimationColorCurve();
            curve.interpolation = interpolation;
            if (keysLen > 0) {
              const { times, values } = AnimationClipDecoder._readFixedNumericKeys(bufferReader, keysLen, 4);
              (<AnimationColorCurve>curve).setKeys(times, values, true);
            }
            break;
          }
          case "AnimationQuaternionCurve": {
            curve = new AnimationQuaternionCurve();
            curve.interpolation = interpolation;
            if (keysLen > 0) {
              const { times, values } = AnimationClipDecoder._readFixedNumericKeys(bufferReader, keysLen, 4);
              (<AnimationQuaternionCurve>curve).setKeys(times, values, true);
            }
            break;
          }
          case "AnimationRefCurve": {
            curve = new AnimationRefCurve();
            curve.interpolation = interpolation;
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
            curve.interpolation = interpolation;
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
            curve.interpolation = interpolation;
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
        clip.addCurveBinding(relativePath, componentType, typeIndex, property, getProperty, curve!);
      }
      resolve(clip);
    });
  }

  private static _readFixedNumericKeys(
    bufferReader: BufferReader,
    keysLen: number,
    valueSize: number
  ): { times: Float32Array; values: Float32Array } {
    const times = new Float32Array(keysLen);
    const stride = valueSize * 3;
    const values = new Float32Array(keysLen * stride);
    for (let j = 0, base = 0; j < keysLen; ++j, base += stride) {
      times[j] = bufferReader.nextFloat32();
      AnimationClipDecoder._readFloatTriple(bufferReader, values, base, valueSize);
    }
    return { times, values };
  }

  private static _readVariableNumericKeys(
    bufferReader: BufferReader,
    keysLen: number
  ): { times: Float32Array; values: Float32Array } | null {
    if (keysLen === 0) {
      return null;
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
    return { times, values };
  }

  private static _readFloatTriple(
    bufferReader: BufferReader,
    values: Float32Array,
    base: number,
    valueSize: number
  ): void {
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
