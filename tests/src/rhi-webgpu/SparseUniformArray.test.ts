import { describe, expect, it, vi } from "vitest";
import type { Engine } from "../../../packages/core/src/Engine";
import type { Buffer } from "../../../packages/core/src/graphic/Buffer";
import { BufferBindFlag } from "../../../packages/core/src/graphic/enums/BufferBindFlag";
import { BufferUsage } from "../../../packages/core/src/graphic/enums/BufferUsage";
import { ShaderDataGroup } from "../../../packages/core/src/shader/enums/ShaderDataGroup";
import { GlobalUniformBlock } from "../../../packages/core/src/shader/GlobalUniformBlock";
import { ShaderData } from "../../../packages/core/src/shader/ShaderData";
import { WebGPUBuffer } from "../../../packages/rhi-webgpu/src/WebGPUBuffer";
import type { WebGPUGraphicDevice } from "../../../packages/rhi-webgpu/src/WebGPUGraphicDevice";

describe("large packed uniform arrays", () => {
  it("preserves every declared word across shorter palettes, owners, arena rotation and recovery", () => {
    if (typeof GPUBufferUsage === "undefined")
      vi.stubGlobal("GPUBufferUsage", { UNIFORM: 64, STORAGE: 128, COPY_SRC: 4, COPY_DST: 8 });
    const count = 1012;
    const words = count * 16 + 8;
    let writtenBytes = 0,
      buffer: Buffer,
      range: Uint32Array;
    const pending: (() => void)[] = [];
    const hardware = {
      maxUniformBlockSize: 65536,
      uniformBufferOffsetAlignment: 256,
      submissionSerial: 0,
      device: {
        createBuffer({ size }: { size: number }) {
          return new Uint8Array(size);
        },
        queue: {
          writeBuffer(
            target: Uint8Array,
            offset: number,
            data: Uint32Array | Uint8Array,
            start = 0,
            length = data.length - start
          ) {
            const bytes = new Uint8Array(
              data.buffer,
              data.byteOffset + start * data.BYTES_PER_ELEMENT,
              length * data.BYTES_PER_ELEMENT
            );
            target.set(bytes, offset);
            writtenBytes += bytes.length;
          }
        }
      },
      createPlatformBuffer(type: BufferBindFlag, size: number, usage: BufferUsage) {
        return new WebGPUBuffer(this as unknown as WebGPUGraphicDevice, type, size, usage);
      },
      bindUniformBufferRange(_binding: number, platform: WebGPUBuffer, offset: number, size: number) {
        expect(size).toBe(words * 4);
        const native = platform._gpuBuffer as unknown as Uint8Array;
        range = new Uint32Array(native.buffer, offset, size / 4);
        platform._markUsed(offset, size);
      }
    };
    const engine = {
      _hardwareRenderer: hardware,
      _renderingStatistics: { _bufferMemory: 0 },
      resourceManager: {
        _addReferResource() {},
        _addGraphicResource(resource: Buffer) {
          buffer = resource;
        }
      }
    } as unknown as Engine;
    const arrayName = "test_MatrixPalette";
    const block = GlobalUniformBlock.acquire(
      engine,
      {
        name: "Auto",
        byteLength: words * 4,
        members: [
          { name: "test_BeforePalette", type: "vec4", offset: 0, arrayLength: 0, arrayStride: 0, matrixStride: 0 },
          { name: arrayName, type: "mat4", offset: 16, arrayLength: count, arrayStride: 64, matrixStride: 16 },
          {
            name: "test_AfterPalette",
            type: "vec4",
            offset: (words - 4) * 4,
            arrayLength: 0,
            arrayStride: 0,
            matrixStride: 0
          }
        ]
      },
      3
    );
    const renderer = new ShaderData(ShaderDataGroup.Renderer),
      element = new ShaderData(ShaderDataGroup.RenderElement);
    const submit = () => {
      for (const assert of pending) assert();
      pending.length = 0;
      ++hardware.submissionSerial;
    };
    let draw = 0;
    const visit = (length: number, owner = renderer) => {
      const actual = new Float32Array(length * 16).fill(++draw);
      actual[0] = -0;
      owner.setFloatArray(arrayName, actual);
      const prefix = new Float32Array([draw, 0, 0, 0]),
        suffix = new Float32Array([-draw, 1, 2, 3]);
      renderer.setFloatArray("test_BeforePalette", prefix);
      renderer.setFloatArray("test_AfterPalette", suffix);
      const expected = new Float32Array(words);
      expected.set(prefix);
      expected.set(actual, 4);
      expected.set(suffix, words - 4);
      const previous = writtenBytes;
      block.bind(undefined, undefined, renderer, undefined, owner === element ? element : undefined);
      const physical = range;
      const expectedWords = new Uint32Array(expected.buffer);
      pending.push(() => expect(physical.some((value, i) => value !== expectedWords[i])).toBe(false));
      return writtenBytes - previous;
    };
    try {
      // Two aligned slots per native backing. Five pending draws force two rotations before submission.
      for (const length of [311, 21, 43, 21, 43]) visit(length);
      submit();
      // Revisit two native pages with known zero tails. Shrinking an old 311-joint slot must zero all its stale entries.
      const costs = [visit(21, element), visit(43), visit(21), visit(21), visit(43)];
      submit();
      expect(costs).toEqual([words, 311 * 16 + 8, 21 * 16 + 8, 43 * 16 + 8, 43 * 16 + 8].map((n) => n * 4));
      // Recovery creates a new physical allocation while the reflected array remains unchanged.
      buffer!._isContentLost = true;
      buffer!._rebuild();
      expect(visit(21)).toBe(words * 4);
      submit();
      expect(buffer!.isContentLost).toBe(false);
      const saved = range.slice();
      // The engine-owned buffer can be found via the public resource manager. A changed slot
      // cannot be rebound as "unchanged" even when its owner still submits the same palette.
      buffer!.setData(new Uint32Array([0xffffffff]), range.byteOffset + 4000 * 4);
      expect(range[4000]).toBe(0xffffffff);
      block.bind(undefined, undefined, renderer);
      expect(range.some((value, i) => value !== saved[i])).toBe(false);
      submit();
      const palette = renderer.getFloatArray(arrayName);
      palette[8] = 987;
      block.bind(undefined, undefined, renderer);
      expect(new Float32Array(range.buffer, range.byteOffset)[12]).toBe(987);
      expect(range[4000]).toBe(0);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
