import { AssetPromise, AssetType, Component, InterpolationType, Loader, ReferResource } from "@galacean/engine-core";
import type { Engine } from "@galacean/engine-core";
import { WebGLEngine } from "@galacean/engine";
import { Color, Quaternion, Vector2, Vector3, Vector4 } from "@galacean/engine-math";
import type { AnimationClip } from "../../../packages/core/src/animation/AnimationClip";
import { decode } from "../../../packages/loader/src/resource-deserialize";
import type { BufferReader } from "../../../packages/loader/src/resource-deserialize/utils/BufferReader";
import { decoder } from "../../../packages/loader/src/resource-deserialize/utils/Decorator";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

class TestComponent extends Component {
  value = 0;
  vec2 = new Vector2();
  vec3 = new Vector3();
  vec4 = new Vector4();
  quat = new Quaternion();
  color = new Color();
  weights: Float32Array = new Float32Array(2);
  arr: number[] = [0, 0];
  flag = false;
  label = "";
  ref: ReferResource | null = null;
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

function finalizeHeader(bytes: number[]): ArrayBuffer {
  const buffer = Uint8Array.from(bytes).buffer;
  new DataView(buffer).setUint32(4, buffer.byteLength, true);
  return buffer;
}

function writeHeader(bytes: number[], version: number, type = "AnimationClip"): void {
  writeUint32(bytes, 0x4e434c47);
  writeUint32(bytes, 0);
  bytes.push(version);
  writeString(bytes, type);
  writeString(bytes, "clip");
  while (bytes.length % 4) bytes.push(0);
  writeString(bytes, "clip");
  writeUint16(bytes, 0); // events
}

function writeBindingHeader(
  bytes: number[],
  version: number,
  property: string,
  interpolation: number,
  keysLen: number,
  curveType: string,
  typeIndex = 0
): void {
  writeString(bytes, "");
  writeString(bytes, "TestComponent");
  if (version >= 2) writeUint16(bytes, typeIndex);
  writeString(bytes, property);
  writeString(bytes, "");
  bytes.push(interpolation);
  writeUint16(bytes, keysLen);
  writeString(bytes, curveType);
}

function createAnimationClipBuffer(version: number, typeIndex = 0, type = "AnimationClip"): ArrayBuffer {
  const bytes: number[] = [];
  writeHeader(bytes, version, type);
  writeUint16(bytes, 1);
  writeBindingHeader(bytes, version, "value", 0, 1, "AnimationFloatCurve", typeIndex);
  writeFloat32(bytes, 0);
  writeFloat32(bytes, 42);
  writeFloat32(bytes, 0);
  writeFloat32(bytes, 0);
  return finalizeHeader(bytes);
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
    entity.destroy();
  });

  it("decodes all numeric, array, and discrete curves into flat storage and resolves AnimationRefCurve refs", async () => {
    const bytes: number[] = [];
    writeHeader(bytes, 2);
    writeUint16(bytes, 11);

    // 1. Multi-key AnimationVector4Curve (regression for missing key loop desyncing BufferReader)
    writeBindingHeader(bytes, 2, "vec4", InterpolationType.Linear, 2, "AnimationVector4Curve");
    for (const [time, val] of [
      [1, [5, 6, 7, 8]],
      [0, [1, 2, 3, 4]]
    ] as const) {
      writeFloat32(bytes, time);
      for (const n of val) writeFloat32(bytes, n);
      for (let k = 0; k < 4; k++) writeFloat32(bytes, 0);
      for (let k = 0; k < 4; k++) writeFloat32(bytes, 0);
    }

    // 2. Hermite AnimationColorCurve with non-unit duration [0, 2] and asymmetric out/in tangents
    writeBindingHeader(bytes, 2, "color", InterpolationType.Hermite, 2, "AnimationColorCurve");
    writeFloat32(bytes, 0);
    for (const n of [0, 0, 0, 1]) writeFloat32(bytes, n); // value
    for (const n of [0, 0, 0, 0]) writeFloat32(bytes, n); // inTangent
    for (const n of [0, 2, 0, 0]) writeFloat32(bytes, n); // outTangent
    writeFloat32(bytes, 2);
    for (const n of [1, 1, 1, 1]) writeFloat32(bytes, n); // value
    for (const n of [0, 0, -2, 0]) writeFloat32(bytes, n); // inTangent
    for (const n of [0, 0, 0, 0]) writeFloat32(bytes, n); // outTangent

    // 3. AnimationFloatArrayCurve
    writeBindingHeader(bytes, 2, "weights", InterpolationType.Linear, 2, "AnimationFloatArrayCurve");
    writeFloat32(bytes, 0);
    writeUint16(bytes, 2);
    for (const n of [0, 1, 0, 0, 0, 0]) writeFloat32(bytes, n);
    writeFloat32(bytes, 1);
    writeUint16(bytes, 2);
    for (const n of [1, 0, 0, 0, 0, 0]) writeFloat32(bytes, n);

    // 4. AnimationArrayCurve
    writeBindingHeader(bytes, 2, "arr", InterpolationType.Linear, 2, "AnimationArrayCurve");
    writeFloat32(bytes, 0);
    writeUint16(bytes, 2);
    for (const n of [10, 20, 0, 0, 0, 0]) writeFloat32(bytes, n);
    writeFloat32(bytes, 1);
    writeUint16(bytes, 2);
    for (const n of [30, 40, 0, 0, 0, 0]) writeFloat32(bytes, n);

    // 5. AnimationBoolCurve
    writeBindingHeader(bytes, 2, "flag", InterpolationType.Step, 2, "AnimationBoolCurve");
    writeFloat32(bytes, 0);
    bytes.push(1);
    writeFloat32(bytes, 1);
    bytes.push(0);

    // 6. AnimationStringCurve
    writeBindingHeader(bytes, 2, "label", InterpolationType.Step, 2, "AnimationStringCurve");
    writeFloat32(bytes, 0);
    writeString(bytes, "idle");
    writeFloat32(bytes, 1);
    writeString(bytes, "run");

    // 7. AnimationRefCurve
    writeBindingHeader(bytes, 2, "ref", InterpolationType.Step, 2, "AnimationRefCurve");
    writeFloat32(bytes, 1);
    writeString(bytes, "");
    writeFloat32(bytes, 0);
    writeString(bytes, JSON.stringify({ url: "mock://ref-a" }));

    // 8. AnimationVector2Curve
    writeBindingHeader(bytes, 2, "vec2", InterpolationType.Linear, 2, "AnimationVector2Curve");
    for (const [time, val] of [
      [0, [2, 4]],
      [1, [6, 8]]
    ] as const) {
      writeFloat32(bytes, time);
      for (const n of val) writeFloat32(bytes, n);
      for (let k = 0; k < 4; k++) writeFloat32(bytes, 0);
    }

    // 9. AnimationVector3Curve
    writeBindingHeader(bytes, 2, "vec3", InterpolationType.Linear, 2, "AnimationVector3Curve");
    for (const [time, val] of [
      [0, [1, 2, 3]],
      [1, [3, 6, 9]]
    ] as const) {
      writeFloat32(bytes, time);
      for (const n of val) writeFloat32(bytes, n);
      for (let k = 0; k < 6; k++) writeFloat32(bytes, 0);
    }

    // 10. AnimationQuaternionCurve
    writeBindingHeader(bytes, 2, "quat", InterpolationType.Linear, 2, "AnimationQuaternionCurve");
    for (const [time, val] of [
      [0, [0, 0, 0, 1]],
      [1, [0, Math.SQRT1_2, 0, Math.SQRT1_2]]
    ] as const) {
      writeFloat32(bytes, time);
      for (const n of val) writeFloat32(bytes, n);
      for (let k = 0; k < 8; k++) writeFloat32(bytes, 0);
    }

    // 11. Empty AnimationFloatArrayCurve (keysLen = 0)
    writeBindingHeader(bytes, 2, "weights", InterpolationType.Linear, 0, "AnimationFloatArrayCurve");

    const clipBuffer = finalizeHeader(bytes);
    const resolvedRef = {} as ReferResource;
    const reqSpy = vi.spyOn(engine.resourceManager, "_request" as never).mockResolvedValueOnce(clipBuffer as never);
    const refSpy = vi.spyOn(engine.resourceManager, "getResourceByRef").mockResolvedValueOnce(resolvedRef);

    const entity = engine.sceneManager.activeScene.createRootEntity("decoded-root");
    const target = entity.addComponent(TestComponent);
    try {
      const clip = await engine.resourceManager.load<AnimationClip>({
        url: "mock://decoded.anim",
        type: AssetType.AnimationClip
      });

      const vec4Curve = clip.curveBindings[0].curve!;
      expect(vec4Curve.keyCount).toBe(2);
      expect(vec4Curve.evaluate(0.5)).toMatchObject({ x: 3, y: 4, z: 5, w: 6 });

      // Hermite at time = 1 on [0, 2]: g = 0.5*0 + 0.25*2 + 0.5*1 = 1.0, b = 0.5*0 - 0.25*(-2) + 0.5*1 = 1.0.
      const colorCurve = clip.curveBindings[1].curve!;
      expect(colorCurve.evaluate(1)).toMatchObject({ r: 0.5, g: 1, b: 1, a: 1 });
      expect(colorCurve.getKey(0).outTangent).toMatchObject({ x: 0, y: 2, z: 0, w: 0 });
      expect(colorCurve.getKey(1).inTangent).toMatchObject({ x: 0, y: 0, z: -2, w: 0 });
      expect(clip.curveBindings[10].curve!.keyCount).toBe(0);

      clip.sampleAnimation(entity, 0.5);
      expect(target.vec2).toMatchObject({ x: 4, y: 6 });
      expect(target.vec3).toMatchObject({ x: 2, y: 4, z: 6 });
      expect(target.vec4).toMatchObject({ x: 3, y: 4, z: 5, w: 6 });
      expect(target.quat.y).toBeCloseTo(Math.sin(Math.PI / 8), 5);
      expect(Array.from(target.weights)).toEqual([0.5, 0.5]);
      expect(target.arr).toEqual([20, 30]);
      expect(target.flag).toBe(true);
      expect(target.label).toBe("idle");
      expect(target.ref).toBe(resolvedRef);

      clip.sampleAnimation(entity, 1);
      expect(target.arr).toEqual([30, 40]);
      expect(target.flag).toBe(false);
      expect(target.label).toBe("run");
      expect(target.ref).toBeNull();
      expect(refSpy).toHaveBeenCalledTimes(1);
    } finally {
      reqSpy.mockRestore();
      refSpy.mockRestore();
      entity.destroy();
    }
  });

  it("rejects array curves with inconsistent keyframe widths", async () => {
    const bytes: number[] = [];
    writeHeader(bytes, 2);
    writeUint16(bytes, 1);
    writeBindingHeader(bytes, 2, "arr", InterpolationType.Linear, 2, "AnimationArrayCurve");
    writeFloat32(bytes, 0);
    writeUint16(bytes, 1);
    for (const n of [1, 0, 0]) writeFloat32(bytes, n);
    writeFloat32(bytes, 1);
    writeUint16(bytes, 2);
    for (const n of [2, 3, 0, 0, 0, 0]) writeFloat32(bytes, n);

    await expect(decode<AnimationClip>(finalizeHeader(bytes), engine)).rejects.toThrow(/inconsistent array keyframe/);
  });
});
