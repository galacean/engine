import { AssetPromise, Component, Loader } from "@galacean/engine-core";
import type { Engine } from "@galacean/engine-core";
import { WebGLEngine } from "@galacean/engine";
import type { AnimationClip } from "../../../packages/core/src/animation/AnimationClip";
import { decode } from "../../../packages/loader/src/resource-deserialize";
import type { BufferReader } from "../../../packages/loader/src/resource-deserialize/utils/BufferReader";
import { decoder } from "../../../packages/loader/src/resource-deserialize/utils/Decorator";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

class TestComponent extends Component {
  value = 0;
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

let engine: WebGLEngine;

beforeAll(async () => {
  engine = await WebGLEngine.create({ canvas: document.createElement("canvas") });
  Loader.registerClass("TestComponent", TestComponent);
});

afterAll(() => engine?.destroy());

describe("AnimationClipDecoder", () => {
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
