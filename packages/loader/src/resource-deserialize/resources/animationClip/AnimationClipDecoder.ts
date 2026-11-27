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
import type { RefItem } from "../../../schema/CommonSchema";
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

type ResolveReference = (ref: RefItem) => PromiseLike<ReferResource | null>;

const numericCurves = new Map<
  string,
  (new () => AnimationCurve<KeyframeValueType>) & Pick<typeof AnimationCurve, "_keyValueSize">
>([
  ["AnimationFloatCurve", AnimationFloatCurve],
  ["AnimationVector2Curve", AnimationVector2Curve],
  ["AnimationVector3Curve", AnimationVector3Curve],
  ["AnimationVector4Curve", AnimationVector4Curve],
  ["AnimationColorCurve", AnimationColorCurve],
  ["AnimationQuaternionCurve", AnimationQuaternionCurve],
  ["AnimationArrayCurve", AnimationArrayCurve],
  ["AnimationFloatArrayCurve", AnimationFloatArrayCurve]
]);

@decoder("AnimationClip")
export class AnimationClipDecoder {
  static decode(
    _engine: Engine,
    bufferReader: BufferReader,
    resolveReference?: ResolveReference
  ): AssetPromise<AnimationClip> {
    return new AssetPromise((resolve, reject) => {
      const clip = new AnimationClip(bufferReader.nextStr());
      const version = bufferReader.header?.version ?? 1;
      const eventsLen = bufferReader.nextUint16();
      for (let i = 0; i < eventsLen; ++i) {
        const event = new AnimationEvent();
        event.time = bufferReader.nextFloat32();
        event.functionName = bufferReader.nextStr();
        event.parameter = JSON.parse(bufferReader.nextStr()).val;
        clip.addEvent(event);
      }

      const referenceLoads: (() => PromiseLike<void>)[] = [];
      const curveBindingsLen = bufferReader.nextUint16();
      for (let i = 0; i < curveBindingsLen; ++i) {
        const relativePath = bufferReader.nextStr();
        const componentType = Loader.getClass(bufferReader.nextStr());
        const typeIndex = version >= 2 ? bufferReader.nextUint16() : 0;
        const property = bufferReader.nextStr();
        const getProperty = bufferReader.nextStr();
        const interpolation = bufferReader.nextUint8();
        const keyCount = bufferReader.nextUint16();
        const curveType = bufferReader.nextStr();
        let curve: AnimationCurve<KeyframeValueType>;
        switch (curveType) {
          case "AnimationRefCurve": {
            const refCurve = new AnimationRefCurve();
            const values = this._decodeDiscreteCurve(refCurve, bufferReader, keyCount, () => {
              const text = bufferReader.nextStr();
              return text ? JSON.parse(text) : null;
            });
            if (resolveReference) {
              for (let j = 0; j < values.length; ++j) {
                const ref = values[j] as unknown as RefItem | null;
                if (typeof ref === "object" && ref?.url) {
                  referenceLoads.push(async () => {
                    values[j] = await resolveReference(ref);
                  });
                }
              }
            }
            curve = refCurve;
            break;
          }
          case "AnimationBoolCurve":
            curve = new AnimationBoolCurve();
            this._decodeDiscreteCurve(curve, bufferReader, keyCount, () => bufferReader.nextUint8() === 1);
            break;
          case "AnimationStringCurve":
            curve = new AnimationStringCurve();
            this._decodeDiscreteCurve(curve, bufferReader, keyCount, () => bufferReader.nextStr());
            break;
          default: {
            const Curve = numericCurves.get(curveType)!;
            curve = new Curve();
            this._decodeNumericCurve(curve, bufferReader, keyCount, Curve._keyValueSize!);
          }
        }
        curve.interpolation = interpolation;
        clip.addCurveBinding(relativePath, componentType, typeIndex, property, getProperty, curve);
      }

      if (referenceLoads.length > 0) {
        Promise.all(referenceLoads.map((load) => load())).then(() => resolve(clip), reject);
      } else {
        resolve(clip);
      }
    });
  }

  private static _decodeNumericCurve(
    curve: AnimationCurve<KeyframeValueType>,
    reader: BufferReader,
    count: number,
    fixedSize: number
  ): void {
    if (count === 0) return;

    const times = new Float32Array(count);
    times[0] = reader.nextFloat32();
    const size = fixedSize || reader.nextUint16();
    const stride = size * 3;
    const values = new Float32Array(count * stride);
    this._readFloatTriple(reader, values, 0, size);
    for (let i = 1; i < count; ++i) {
      times[i] = reader.nextFloat32();
      if (!fixedSize) {
        const width = reader.nextUint16();
        if (width !== size) {
          throw new Error(`AnimationClipDecoder: inconsistent array keyframe length ${width} (expected ${size}).`);
        }
      }
      this._readFloatTriple(reader, values, i * stride, size);
    }
    this._orderKeys(times, values, stride);
    curve._setKeyBuffers(times, values, true);
  }

  private static _decodeDiscreteCurve<V extends KeyframeValueType>(
    curve: AnimationCurve<V>,
    reader: BufferReader,
    count: number,
    readValue: () => V
  ): V[] {
    const times = new Float32Array(count);
    const values = new Array<V>(count);
    for (let i = 0; i < count; ++i) {
      times[i] = reader.nextFloat32();
      values[i] = readValue();
    }
    this._orderKeys(times, values, 1);
    curve._setKeyBuffers(times, values);
    return values;
  }

  private static _orderKeys(times: Float32Array, values: Float32Array | KeyframeValueType[], stride: number): void {
    for (let i = 1; i < times.length; ++i) {
      if (times[i] >= times[i - 1]) continue;

      // The binary encoder writes keys in the order supplied by the caller
      const order = Array.from(times.keys()).sort((a, b) => times[a] - times[b]);
      times.set(Float32Array.from(order, (index) => times[index]));
      if (Array.isArray(values)) {
        const source = values.slice();
        for (let j = 0; j < order.length; ++j) {
          values[j] = source[order[j]];
        }
      } else {
        const source = values.slice();
        for (let j = 0; j < order.length; ++j) {
          const offset = order[j] * stride;
          values.set(source.subarray(offset, offset + stride), j * stride);
        }
      }
      return;
    }
  }

  private static _readFloatTriple(reader: BufferReader, values: Float32Array, base: number, size: number): void {
    // The binary stream stores value before the two tangents
    for (let i = 0; i < size; ++i) values[base + size + i] = reader.nextFloat32();
    for (let i = 0; i < size; ++i) values[base + i] = reader.nextFloat32();
    for (let i = 0; i < size; ++i) values[base + size * 2 + i] = reader.nextFloat32();
  }
}
