import {
  type Buffer,
  IndexFormat,
  type IPlatformPrimitive,
  type IPlatformShaderProgram,
  MeshTopology,
  Primitive,
  SubPrimitive,
  VertexElementFormat
} from "@galacean/engine-core";
import type { IPlatformShaderSource } from "@galacean/engine-core";
interface VertexStream {
  binding: number;
  buffer: Buffer;
  rate: number;
  slot: number;
  expanded?: GPUBuffer;
}
interface VertexLayout {
  buffers: Array<GPUVertexBufferLayout | null>;
  defaultBufferSlot?: number;
  key: number;
  streams: VertexStream[];
  expandedStreams: VertexStream[];
  packedStreams?: WebGPUPackedVertexStream[];
}
type IShaderVertexInputReflection = NonNullable<IPlatformShaderSource["reflection"]>["vertexInputs"][number];
import { WebGPUPrimitiveEmulation } from "./WebGPUPrimitiveEmulation";
import { WebGPUPackedVertexStream } from "./WebGPUPackedVertexStream";
import type { RenderDrawCommands } from "./WebGPUDrawBundles";
import { WebGPUBuffer } from "./WebGPUBuffer";
import type { WebGPUGraphicDevice } from "./WebGPUGraphicDevice";
import { WebGPUShaderProgram } from "./WebGPUShaderProgram";

/**
 * WebGPU primitive binding.
 * @internal
 */
export class WebGPUPrimitive implements IPlatformPrimitive {
  /** @internal */
  readonly primitive: Primitive;

  private readonly _device: WebGPUGraphicDevice;
  private _layoutDevice: GPUDevice;
  private readonly _layouts = new Map<readonly IShaderVertexInputReflection[], VertexLayout>();
  private _emulation?: WebGPUPrimitiveEmulation;

  constructor(device: WebGPUGraphicDevice, primitive: Primitive) {
    this._device = device;
    this._layoutDevice = device.device;
    this.primitive = primitive;
  }

  draw(shaderProgram: IPlatformShaderProgram, subPrimitive: SubPrimitive): void {
    (shaderProgram as WebGPUShaderProgram).draw(this, subPrimitive);
  }

  destroy(): void {
    this._emulation?.destroy();
    this._clearLayouts();
  }

  private _clearLayouts(): void {
    for (const layout of this._layouts.values()) {
      if (layout.packedStreams) for (const stream of layout.packedStreams) stream.destroy();
    }
    this._layouts.clear();
  }

  _prepareIndexBuffer(sub: SubPrimitive, vertex: VertexLayout): GPUBuffer | undefined {
    if (vertex.packedStreams) {
      for (const stream of vertex.packedStreams) stream.prepare(this.primitive.instanceCount || 1);
    }
    for (let i = 0; i < vertex.expandedStreams.length; i++) {
      const stream = vertex.expandedStreams[i];
      this._emulation ??= new WebGPUPrimitiveEmulation(this._device);
      stream.expanded = this._emulation.instances(
        this.primitive.vertexBufferBindings[stream.binding]!,
        stream.rate,
        this.primitive.instanceCount || 1
      );
    }
    if (sub.topology === MeshTopology.LineLoop || sub.topology === MeshTopology.TriangleFan) {
      this._emulation ??= new WebGPUPrimitiveEmulation(this._device);
      return this._emulation.indexBuffer(sub, this.primitive.indexBufferBinding);
    }
    const binding = this.primitive.indexBufferBinding;
    if (!binding) return undefined;
    if (binding.format === IndexFormat.UInt8)
      return (binding.buffer._platformBuffer as WebGPUBuffer)._getUInt16Indices();
  }

  /** @internal */
  _getVertexState(inputs: readonly IShaderVertexInputReflection[]): VertexLayout {
    if (this._layoutDevice !== this._device.device) {
      this._layoutDevice = this._device.device;
      this._emulation?.destroy();
      this._emulation = undefined;
      this._clearLayouts();
    } else if (this.primitive._bufferStructChanged) this._clearLayouts();
    const cached = this._layouts.get(inputs);
    if (cached) return cached;
    const locations = new Map(inputs.map((input) => [input.name, input.location]));
    const boundLocations = new Set<number>();
    const primitive = this.primitive;
    const bufferCount = primitive.vertexBufferBindings.length;
    const buffers: GPUVertexBufferLayout[] = [];

    const streams: VertexStream[] = [];
    for (let bindingIndex = 0; bindingIndex < bufferCount; bindingIndex++) {
      const binding = primitive.vertexBufferBindings[bindingIndex];
      if (!binding) {
        continue;
      }

      const byRate = new Map<number, GPUVertexAttribute[]>();
      for (const element of primitive.vertexElements) {
        if (element.bindingIndex !== bindingIndex) {
          continue;
        }
        const shaderLocation = locations.get(element.attribute);
        if (shaderLocation === undefined) {
          continue;
        }
        let attributes = byRate.get(element.instanceStepRate);
        if (!attributes) byRate.set(element.instanceStepRate, (attributes = []));
        attributes.push({
          shaderLocation,
          offset: element.offset,
          format: WebGPUPrimitive._vertexFormat(element.format)
        });
        boundLocations.add(shaderLocation);
      }

      for (const [instanceStepRate, attributes] of byRate) {
        // A mesh binding index is engine metadata. Only shader-active physical streams need native slots.
        const existing = streams.find(
          (stream) =>
            stream.buffer === binding.buffer &&
            stream.rate === instanceStepRate &&
            buffers[stream.slot].arrayStride === binding.stride
        );
        if (existing) {
          (buffers[existing.slot].attributes as GPUVertexAttribute[]).push(...attributes);
          continue;
        }
        const slot = buffers.length;
        streams.push({ binding: bindingIndex, buffer: binding.buffer, rate: instanceStepRate, slot });
        attributes.sort((left, right) => left.shaderLocation - right.shaderLocation);
        buffers[slot] = {
          arrayStride: binding.stride,
          stepMode: instanceStepRate === 0 ? "vertex" : "instance",
          attributes
        };
      }
    }

    const missingInputs = inputs.filter((input) => !boundLocations.has(input.location));
    const limits = this._device.device.limits;
    const excess = buffers.length + Number(missingInputs.length > 0) - limits.maxVertexBuffers;
    let packedStreams: WebGPUPackedVertexStream[] | undefined;
    const requiresPack = (s: VertexStream) =>
      WebGPUPackedVertexStream.requiresPacking(buffers[s.slot], limits.maxVertexBufferArrayStride);
    if (excess > 0 || streams.some(requiresPack)) {
      const selected = streams.filter(requiresPack);
      let needed = excess;
      for (const instance of [false, true]) {
        needed -= Math.max(0, selected.filter((s) => Boolean(s.rate) === instance).length - 1);
      }
      for (const instance of [false, true]) {
        if (needed <= 0) break;
        const alreadyPacked = selected.some((s) => Boolean(s.rate) === instance);
        const candidates = streams.filter((s) => Boolean(s.rate) === instance && !selected.includes(s));
        const reserve = alreadyPacked ? 0 : 1;
        if (candidates.length <= reserve) continue;
        // Keep independent dynamic inputs as native vertex slots whenever static streams can absorb the excess.
        candidates.sort((a, b) => a.buffer.bufferUsage - b.buffer.bufferUsage);
        const count = Math.min(needed + reserve, candidates.length);
        selected.push(...candidates.slice(0, count));
        needed -= count - reserve;
      }
      const layouts = buffers.slice();
      const direct = streams.filter((s) => !selected.includes(s));
      streams.length = buffers.length = 0;
      for (const stream of direct) {
        const layout = layouts[stream.slot];
        stream.slot = buffers.length;
        streams.push(stream);
        buffers.push(layout);
      }
      packedStreams = [];
      for (const instance of [false, true]) {
        const sources = selected
          .filter((s) => Boolean(s.rate) === instance)
          .map((s) => ({
            buffer: s.buffer,
            stride: layouts[s.slot].arrayStride,
            rate: s.rate,
            attributes: layouts[s.slot].attributes as GPUVertexAttribute[]
          }));
        if (!sources.length) continue;
        const packed = new WebGPUPackedVertexStream(this._device, sources, buffers.length);
        packedStreams.push(packed);
        buffers.push(packed.layout);
      }
    }
    let defaultBufferSlot: number | undefined;
    if (missingInputs.length > 0) {
      defaultBufferSlot = buffers.length;
      buffers[defaultBufferSlot] = {
        arrayStride: 0,
        stepMode: "vertex",
        attributes: missingInputs.map(WebGPUPrimitive._defaultVertexAttribute)
      };
    }

    const result = {
      buffers,
      defaultBufferSlot,
      streams,
      packedStreams,
      expandedStreams: streams.filter((stream) => stream.rate > 1),
      key: this._device._getVertexLayoutId(buffers)
    };
    this._layouts.set(inputs, result);
    return result;
  }

  /** @internal */
  _getPrimitiveState(topology: MeshTopology): GPUPrimitiveState {
    const state: GPUPrimitiveState = {
      topology: WebGPUPrimitive._topology(topology)
    };
    if (
      this.primitive.indexBufferBinding &&
      (topology === MeshTopology.LineStrip || topology === MeshTopology.TriangleStrip)
    ) {
      state.stripIndexFormat = this._indexFormat();
    }
    if (topology === MeshTopology.LineLoop) state.stripIndexFormat = "uint32";
    return state;
  }

  /** @internal */
  _encodeDraw(
    pass: RenderDrawCommands,
    subPrimitive: SubPrimitive,
    vertex: VertexLayout,
    indexBuffer?: GPUBuffer
  ): void {
    const primitive = this.primitive;
    const { defaultBufferSlot, streams } = vertex;
    for (let i = 0; i < streams.length; i++) {
      const stream = streams[i];
      const buffer = (stream.buffer._platformBuffer as WebGPUBuffer)._useForDraw();
      this._device._setVertexBuffer(pass, stream.slot, stream.expanded ?? buffer);
    }
    if (vertex.packedStreams) {
      for (const stream of vertex.packedStreams) this._device._setVertexBuffer(pass, stream.slot, stream.buffer!);
    }
    if (defaultBufferSlot !== undefined) {
      this._device._setVertexBuffer(pass, defaultBufferSlot, this._device._getDefaultVertexBuffer());
    }

    const instanceCount = primitive.instanceCount || 1;
    const indexBinding = primitive.indexBufferBinding;
    if (subPrimitive.topology === MeshTopology.LineLoop || subPrimitive.topology === MeshTopology.TriangleFan) {
      this._device._setIndexBuffer(pass, indexBuffer!, "uint32");
      pass.drawIndexed(this._emulation!.expandedCount(subPrimitive), instanceCount);
    } else if (indexBinding) {
      const format = this._indexFormat();
      const native = (indexBinding.buffer._platformBuffer as WebGPUBuffer)._useForDraw();
      this._device._setIndexBuffer(pass, indexBuffer ?? native, format);
      pass.drawIndexed(subPrimitive.count, instanceCount, subPrimitive.start, 0, 0);
    } else {
      pass.draw(subPrimitive.count, instanceCount, subPrimitive.start, 0);
    }
  }

  private _indexFormat(): GPUIndexFormat {
    switch (this.primitive.indexBufferBinding!.format) {
      case IndexFormat.UInt8:
      case IndexFormat.UInt16:
        return "uint16";
      case IndexFormat.UInt32:
        return "uint32";
      default:
        throw new Error(`Unsupported index format ${this.primitive.indexBufferBinding!.format}.`);
    }
  }

  private static _topology(topology: MeshTopology): GPUPrimitiveTopology {
    switch (topology) {
      case MeshTopology.Points:
        return "point-list";
      case MeshTopology.Lines:
        return "line-list";
      case MeshTopology.LineStrip:
        return "line-strip";
      case MeshTopology.Triangles:
        return "triangle-list";
      case MeshTopology.TriangleStrip:
        return "triangle-strip";
      case MeshTopology.LineLoop:
        return "line-strip";
      case MeshTopology.TriangleFan:
        return "triangle-list";
    }
  }

  /** @internal */
  static _vertexFormat(format: VertexElementFormat): GPUVertexFormat {
    switch (format) {
      case VertexElementFormat.Float:
        return "float32";
      case VertexElementFormat.UInt4:
        return "uint32x4";
      case VertexElementFormat.Vector2:
        return "float32x2";
      case VertexElementFormat.Vector3:
        return "float32x3";
      case VertexElementFormat.Vector4:
        return "float32x4";
      case VertexElementFormat.Byte4:
        return "sint8x4";
      case VertexElementFormat.UByte4:
        return "uint8x4";
      case VertexElementFormat.NormalizedByte4:
        return "snorm8x4";
      case VertexElementFormat.NormalizedUByte4:
        return "unorm8x4";
      case VertexElementFormat.Short2:
        return "sint16x2";
      case VertexElementFormat.UShort2:
        return "uint16x2";
      case VertexElementFormat.NormalizedShort2:
        return "snorm16x2";
      case VertexElementFormat.NormalizedUShort2:
        return "unorm16x2";
      case VertexElementFormat.Short4:
        return "sint16x4";
      case VertexElementFormat.UShort4:
        return "uint16x4";
      case VertexElementFormat.NormalizedShort4:
        return "snorm16x4";
      case VertexElementFormat.NormalizedUShort4:
        return "unorm16x4";
    }
  }

  private static _defaultVertexAttribute(input: IShaderVertexInputReflection): GPUVertexAttribute {
    const { type, location: shaderLocation, components } = input;
    const scalar = type === "float" ? "float32" : type === "sint" ? "sint32" : "uint32";
    const format = (components === 1 ? scalar : `${scalar}x${components}`) as GPUVertexFormat;
    return { shaderLocation, offset: type === "float" ? 0 : type === "sint" ? 16 : 32, format };
  }
}
