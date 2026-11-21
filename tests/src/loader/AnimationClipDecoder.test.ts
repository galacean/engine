import { AssetPromise, Component, InterpolationType, Loader } from "@galacean/engine-core";
import type { AnimationArrayCurve, AnimationFloatArrayCurve, Engine } from "@galacean/engine-core";
import { WebGLEngine } from "@galacean/engine";
import type { AnimationClip } from "../../../packages/core/src/animation/AnimationClip";
import { decode } from "../../../packages/loader/src/resource-deserialize";
import type { BufferReader } from "../../../packages/loader/src/resource-deserialize/utils/BufferReader";
import { decoder } from "../../../packages/loader/src/resource-deserialize/utils/Decorator";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

class TestComponent extends Component {
  value: number | number[] | Float32Array = 0;
}

const customDecoderType = "DecoderArgumentContract";

@decoder(customDecoderType)
class DecoderArgumentContract {
  static decode(_engine: Engine, _bufferReader: BufferReader, value: object): AssetPromise<object> {
    return AssetPromise.resolve(value);
  }
}

function writeNumber(bytes: number[], byteLength: number, write: (view: DataView) => void): void {
  const buffer = new ArrayBuffer(byteLength);
  write(new DataView(buffer));
  bytes.push(...new Uint8Array(buffer));
}

function writeUint16(bytes: number[], value: number): void {
  writeNumber(bytes, 2, (view) => view.setUint16(0, value, true));
}

function writeUint32(bytes: number[], value: number): void {
  writeNumber(bytes, 4, (view) => view.setUint32(0, value, true));
}

function writeFloat32(bytes: number[], value: number): void {
  writeNumber(bytes, 4, (view) => view.setFloat32(0, value, true));
}

function writeString(bytes: number[], value: string): void {
  const valueBytes = new TextEncoder().encode(value);
  writeUint16(bytes, valueBytes.byteLength);
  bytes.push(...valueBytes);
}

function createAnimationClipBuffer(version: number, typeIndex = 0, type = "AnimationClip"): ArrayBuffer {
  const bytes: number[] = [];
  writeUint32(bytes, 0x4e434c47);
  writeUint32(bytes, 0);
  bytes.push(version);
  writeString(bytes, type);
  writeString(bytes, "clip");
  while (bytes.length % 4) bytes.push(0);

  writeString(bytes, "clip");
  writeUint16(bytes, 0);
  writeUint16(bytes, 1);
  writeString(bytes, "");
  writeString(bytes, "TestComponent");
  if (version >= 2) writeUint16(bytes, typeIndex);
  writeString(bytes, "value");
  writeString(bytes, "");
  bytes.push(0);
  writeUint16(bytes, 1);
  writeString(bytes, "AnimationFloatCurve");
  writeFloat32(bytes, 0);
  writeFloat32(bytes, 42);
  writeFloat32(bytes, 0);
  writeFloat32(bytes, 0);

  const buffer = Uint8Array.from(bytes).buffer;
  new DataView(buffer).setUint32(4, buffer.byteLength, true);
  return buffer;
}

function createArrayClipBuffer(curveType: string, name: string, interpolation: InterpolationType): ArrayBuffer {
  const bytes: number[] = [];
  writeUint32(bytes, 0x4e434c47);
  writeUint32(bytes, 0);
  bytes.push(2);
  writeString(bytes, "AnimationClip");
  writeString(bytes, name);
  while (bytes.length % 4) bytes.push(0);
  writeString(bytes, name);
  writeUint16(bytes, 0);
  writeUint16(bytes, 1);
  writeString(bytes, "");
  writeString(bytes, "TestComponent");
  writeUint16(bytes, 0);
  writeString(bytes, "value");
  writeString(bytes, "value");
  bytes.push(interpolation);
  writeUint16(bytes, 2);
  writeString(bytes, curveType);
  for (const [time, values] of [
    [0, [0, 1]],
    [1, [1, 0]]
  ] as const) {
    writeFloat32(bytes, time);
    writeUint16(bytes, values.length);
    for (const numbers of [values, [2, 3], [4, 5]]) {
      for (const value of numbers) writeFloat32(bytes, value);
    }
  }
  const buffer = Uint8Array.from(bytes).buffer;
  new DataView(buffer).setUint32(4, buffer.byteLength, true);
  return buffer;
}

let engine: WebGLEngine;

beforeAll(async () => {
  engine = await WebGLEngine.create({ canvas: document.createElement("canvas") });
  Loader.registerClass("TestComponent", TestComponent);
});

afterAll(() => engine?.destroy());

describe("AnimationClipDecoder", () => {
  for (const curveType of ["AnimationArrayCurve", "AnimationFloatArrayCurve"]) {
    for (const interpolation of [InterpolationType.Linear, InterpolationType.Step, InterpolationType.Hermite]) {
      it.each(["a", "ab", "abc", "arrays"])(
        `decodes packed ${curveType}/${interpolation} keys for clip %s`,
        async (name) => {
          const clip = await decode<AnimationClip>(createArrayClipBuffer(curveType, name, interpolation), engine);
          const curve = clip.curveBindings[0].curve as AnimationArrayCurve | AnimationFloatArrayCurve;
          expect(
            curve.keys.map((key) => ({
              time: key.time,
              value: Array.from(key.value),
              inTangent: Array.from(key.inTangent),
              outTangent: Array.from(key.outTangent)
            }))
          ).toEqual([
            { time: 0, value: [0, 1], inTangent: [2, 3], outTangent: [4, 5] },
            { time: 1, value: [1, 0], inTangent: [2, 3], outTangent: [4, 5] }
          ]);
          const expected =
            interpolation === InterpolationType.Step
              ? [0, 1]
              : interpolation === InterpolationType.Hermite
                ? [0.75, 0.75]
                : [0.5, 0.5];
          const entity = engine.sceneManager.activeScene.createRootEntity("array target");
          const component = entity.addComponent(TestComponent);
          const target = (component.value =
            curveType === "AnimationArrayCurve" ? [4, 5, 6] : new Float32Array([4, 5]));
          clip.sampleAnimation(entity, 0.5);
          expect(component.value).toBe(target);
          expect(Array.from(component.value)).toEqual(expected);
          expect(Array.from(curve.evaluate(0.5))).toEqual(expected);
          entity.destroy();
          clip.destroy();
        }
      );
    }
  }

  it("preserves custom decoder argument positions", async () => {
    const sentinel = {};
    const result = await decode<object>(createAnimationClipBuffer(1, 0, customDecoderType), engine, sentinel);

    expect(result).toBe(sentinel);
  });

  it("keeps v1 bindings at index 0 and applies a v2 binding to the indexed component", async () => {
    const v1 = await decode<AnimationClip>(createAnimationClipBuffer(1), engine);
    const v2 = await decode<AnimationClip>(createAnimationClipBuffer(2, 1), engine);
    const entity = engine.sceneManager.activeScene.createRootEntity("root");
    const first = entity.addComponent(TestComponent);
    const second = entity.addComponent(TestComponent);

    expect(v1.curveBindings[0].typeIndex).toBe(0);
    expect(v2.curveBindings[0].typeIndex).toBe(1);

    v2.sampleAnimation(entity, 0);

    expect(first.value).toBe(0);
    expect(second.value).toBe(42);
  });
});
