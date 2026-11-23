import type { Buffer } from "@galacean/engine-core";
import { WebGPUBuffer } from "./WebGPUBuffer";
import type { WebGPUGraphicDevice } from "./WebGPUGraphicDevice";

export interface PackingSource {
  buffer: Buffer;
  stride: number;
  rate: number;
  attributes: GPUVertexAttribute[];
}

interface PackedField {
  buffer: Buffer;
  offset: number;
  stride: number;
  rate: number;
  words: number;
  destination: number;
  version: number;
  records: number;
  source?: GPUBuffer;
}

// All vertex formats currently exposed by the engine contain whole 32-bit words. Reassemble
// a word across source words when a legal WebGL byte/short layout starts at an unaligned offset.
const gather = `
struct Params {
  first: u32, records: u32, divisor: u32, sourceStride: u32,
  sourceOffset: u32, firstSourceRecord: u32, destinationOffset: u32, destinationStride: u32,
  words: u32,
}
@group(0) @binding(0) var<storage,read> src:array<u32>;
@group(0) @binding(1) var<storage,read_write> dst:array<u32>;
@group(0) @binding(2) var<uniform> p:Params;
@compute @workgroup_size(64) fn pack(@builtin(global_invocation_id) id:vec3u,@builtin(num_workgroups) dims:vec3u) {
  let i=id.x+id.y*dims.x*64u;
  if(i>=p.records){return;}
  let address=p.sourceOffset+((p.first+i)/p.divisor-p.firstSourceRecord)*p.sourceStride;
  let shift=(address%4u)*8u;
  let output=p.destinationOffset+i*p.destinationStride;
  for(var w=0u; w<p.words; w++){
    let j=address/4u+w;
    var bits=src[j]>>shift;
    if(shift!=0u){bits|=src[j+1u]<<(32u-shift);}
    dst[output+w]=bits;
  }
}`;

function formatWords(format: GPUVertexFormat): number {
  const parts = /^(?:float|uint|sint|unorm|snorm)(8|16|32)(?:x([234]))?$/.exec(format);
  if (!parts) throw Error("Unsupported packed vertex format " + format);
  return (Number(parts[1]) * Number(parts[2] ?? 1)) / 32;
}

/** A last-resort physical stream for independent shader inputs exceeding native binding limits. */
export class WebGPUPackedVertexStream {
  private static readonly _pipelines = new WeakMap<GPUDevice, GPUComputePipeline>();
  readonly layout: GPUVertexBufferLayout;
  private readonly _fields: PackedField[] = [];
  private readonly _vertexCount: number;
  buffer?: GPUBuffer;
  private _capacity = 0;

  static requiresPacking(layout: GPUVertexBufferLayout, maxStride: number): boolean {
    const stride = layout.arrayStride;
    if (!stride || stride % 4 || stride > maxStride) return true;
    return Array.from(layout.attributes).some(
      (attr) => attr.offset % 4 !== 0 || attr.offset + formatWords(attr.format) * 4 > stride
    );
  }

  constructor(
    private readonly _hardware: WebGPUGraphicDevice,
    sources: PackingSource[],
    readonly slot: number
  ) {
    const attributes: GPUVertexAttribute[] = [];
    let bytes = 0,
      maxRecords = Infinity;
    for (const source of sources) {
      for (const attr of source.attributes) {
        const words = formatWords(attr.format);
        const stride = source.stride || words * 4;
        attributes.push({ ...attr, offset: bytes });
        this._fields.push({
          buffer: source.buffer,
          offset: attr.offset,
          stride,
          rate: Math.max(1, source.rate),
          words,
          destination: bytes / 4,
          version: -1,
          records: 0
        });
        const accessible = Math.max(0, 1 + Math.floor((source.buffer.byteLength - attr.offset - words * 4) / stride));
        maxRecords = Math.min(maxRecords, accessible * Math.max(1, source.rate));
        bytes += words * 4;
      }
    }
    this._vertexCount = maxRecords;
    this.layout = { arrayStride: bytes, stepMode: sources[0].rate ? "instance" : "vertex", attributes };
  }

  prepare(instanceCount: number): void {
    const hardware = this._hardware,
      device = hardware.device;
    const count = this.layout.stepMode === "vertex" ? this._vertexCount : instanceCount;
    if (count > this._vertexCount) throw Error("Instance input exceeds its source vertex buffer.");
    if (!this.buffer || count > this._capacity) {
      const size = Math.max(1, count) * this.layout.arrayStride;
      if (size > device.limits.maxBufferSize)
        throw Error(`Packed vertex stream needs ${size} bytes, device limit ${device.limits.maxBufferSize}.`);
      const buffer = device.createBuffer({
        label: "Galacean packed vertex input",
        size,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.VERTEX
      });
      if (this.buffer) hardware._retireBuffer(this.buffer);
      this.buffer = buffer;
      this._capacity = count;
      for (const field of this._fields) field.records = 0;
    }
    for (const field of this._fields) {
      const source = field.buffer._platformBuffer as WebGPUBuffer;
      if (field.source === source._gpuBuffer && field.version === source._contentVersion && field.records >= count)
        continue;
      if (count) this._copy(field, source, count);
      field.records = count;
      field.source = source._gpuBuffer;
      field.version = source._contentVersion;
    }
  }

  private _copy(field: PackedField, source: WebGPUBuffer, count: number): void {
    const hardware = this._hardware,
      device = hardware.device,
      limits = device.limits;
    let pipeline = WebGPUPackedVertexStream._pipelines.get(device);
    if (!pipeline) {
      const module = device.createShaderModule({ label: "Pack vertex streams", code: gather });
      pipeline = device.createComputePipeline({ layout: "auto", compute: { module, entryPoint: "pack" } });
      WebGPUPackedVertexStream._pipelines.set(device, pipeline);
    }
    const native = source._useForDraw(),
      destination = this.buffer!;
    const alignment = limits.minStorageBufferOffsetAlignment,
      limit = limits.maxStorageBufferBindingSize;
    const dstStride = this.layout.arrayStride;
    const pass = hardware._beginComputePass();
    pass.setPipeline(pipeline);
    // A large vertex allocation can exceed maxStorageBufferBindingSize while remaining a legal
    // vertex buffer. Bind aligned windows of the original source and destination for each dispatch.
    for (let first = 0; first < count; ) {
      const firstSrc = Math.floor(first / field.rate),
        srcStart = field.offset + firstSrc * field.stride;
      const srcBase = Math.floor(srcStart / alignment) * alignment;
      const dstStart = first * dstStride,
        dstBase = Math.floor(dstStart / alignment) * alignment;
      const lastSrc = firstSrc + Math.floor((limit - (srcStart - srcBase) - field.words * 4) / field.stride);
      const rows = Math.min(
        count - first,
        (lastSrc + 1) * field.rate - first,
        Math.floor((limit - (dstStart - dstBase)) / dstStride)
      );
      if (rows < 1) throw Error("Packed vertex field exceeds the device storage binding limit.");
      const srcEnd = field.offset + Math.floor((first + rows - 1) / field.rate) * field.stride + field.words * 4;
      const params = device.createBuffer({ size: 48, usage: GPUBufferUsage.UNIFORM, mappedAtCreation: true });
      new Uint32Array(params.getMappedRange()).set([
        first,
        rows,
        field.rate,
        field.stride,
        srcStart - srcBase,
        firstSrc,
        (dstStart - dstBase) / 4 + field.destination,
        dstStride / 4,
        field.words
      ]);
      params.unmap();
      hardware._retireBuffer(params);
      const group = device.createBindGroup({
        layout: pipeline.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: { buffer: native, offset: srcBase, size: Math.ceil((srcEnd - srcBase) / 4) * 4 } },
          {
            binding: 1,
            resource: { buffer: destination, offset: dstBase, size: dstStart - dstBase + rows * dstStride }
          },
          { binding: 2, resource: { buffer: params } }
        ]
      });
      pass.setBindGroup(0, group);
      const groups = Math.ceil(rows / 64),
        x = Math.min(groups, limits.maxComputeWorkgroupsPerDimension);
      pass.dispatchWorkgroups(x, Math.ceil(groups / x));
      first += rows;
    }
  }

  destroy(): void {
    if (this.buffer) this._hardware._retireBuffer(this.buffer);
    this.buffer = undefined;
  }
}
