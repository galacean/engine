import {
  IndexFormat,
  MeshTopology,
  type IndexBufferBinding,
  type SubPrimitive,
  type VertexBufferBinding
} from "@galacean/engine-core";
import type { WebGPUBuffer } from "./WebGPUBuffer";
import type { WebGPUGraphicDevice } from "./WebGPUGraphicDevice";

interface ExpandedBuffer {
  buffer: GPUBuffer;
  source?: GPUBuffer;
  version?: number;
  count: number;
  start?: number;
  mode?: number;
  format?: number;
}

const fanOrLoop = `
  @group(0) @binding(0) var<storage, read> indices:array<u32>;
  @group(0) @binding(1) var<storage, read_write> expanded:array<u32>;
  @group(0) @binding(2) var<uniform> params:vec4u;
  fn indexAt(i:u32) -> u32 {
    if (params.z == 8u) {return (indices[i/4u] >> (8u*(i%4u))) & 255u;}
    if (params.z == 16u) {return (indices[i/2u] >> (16u*(i%2u))) & 65535u;}
    return indices[i];
  }
  // The restart index breaks a contour and resets its fan center. This conversion is cached until the index data changes.
  @compute @workgroup_size(1) fn expand() {
    var length=0u;
    var center=0u;
    var previous=0u;
    var cursor=0u;
    let restart=0xffffffffu >> (32u-params.z);
    for (var j=0u; j<params.y; j++) {
      let index=indexAt(params.x+j);
      if (index==restart) {
        if (params.w==1u && length>0u) {
          expanded[cursor]=center;
          expanded[cursor+1u]=0xffffffffu;
          cursor+=2u;
        }
        length=0u;
        continue;
      }
      if (length==0u) {center=index;}
      if (params.w==1u) {
        expanded[cursor]=index;
        cursor++;
      } else if (length>=2u) {
        expanded[cursor]=center;
        expanded[cursor+1u]=previous;
        expanded[cursor+2u]=index;
        cursor+=3u;
      }
      previous=index;
      length++;
    }
    if (params.w==1u && length>0u) {
      expanded[cursor]=center;
      cursor++;
    }
    // Tail restart indices are skipped by line strips. Identical triangle vertices have zero area.
    let fill=select(0u,0xffffffffu,params.w==1u);
    for (; cursor<arrayLength(&expanded); cursor++) {expanded[cursor]=fill;}
  }`;

const repeatInstances = `
  @group(0) @binding(0) var<storage, read> input:array<u32>;
  @group(0) @binding(1) var<storage, read_write> output:array<u32>;
  @group(0) @binding(2) var<uniform> params:vec4u;
  @compute @workgroup_size(64) fn expand(@builtin(global_invocation_id) id:vec3u) {
    if (id.x>=params.x*params.y) {return;}
    output[id.x]=input[(id.x/params.y/params.z)*params.y+id.x%params.y];
  }`;

/** WebGL topologies and per-attribute instance divisors expressed as ordinary WebGPU buffers. */
export class WebGPUPrimitiveEmulation {
  private _indices = new Map<SubPrimitive, ExpandedBuffer>();
  private _instances = new Map<VertexBufferBinding, Map<number, ExpandedBuffer>>();
  private static _pipelines = new WeakMap<GPUDevice, Map<string, GPUComputePipeline>>();
  private _params = new Uint32Array(4);

  constructor(private _hardware: WebGPUGraphicDevice) {}

  indexBuffer(sub: SubPrimitive, binding: IndexBufferBinding | null): GPUBuffer {
    const source = binding?.buffer._platformBuffer as WebGPUBuffer | undefined;
    const loop = sub.topology === MeshTopology.LineLoop;
    const count = loop ? (binding ? sub.count * 2 : sub.count + 1) : 3 * Math.max(0, sub.count - 2);
    let cached = this._indices.get(sub);
    if (
      cached &&
      cached.source === source?._gpuBuffer &&
      cached.version === source?._contentVersion &&
      cached.mode === sub.topology &&
      cached.start === sub.start &&
      cached.count === count &&
      cached.format === binding?.format
    )
      return cached.buffer;
    const size = Math.max(4, 4 * count);
    if (cached) this._hardware._retireBuffer(cached.buffer);
    const buffer = this._hardware.device.createBuffer({
      size,
      usage: GPUBufferUsage.INDEX | GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
    });
    cached = {
      buffer,
      count,
      start: sub.start,
      mode: sub.topology,
      format: binding?.format,
      source: source?._gpuBuffer,
      version: source?._contentVersion
    };
    this._indices.set(sub, cached);
    if (source && count) {
      this._params[0] = sub.start;
      this._params[1] = sub.count;
      this._params[2] = binding!.format === IndexFormat.UInt32 ? 32 : binding!.format === IndexFormat.UInt16 ? 16 : 8;
      this._params[3] = loop ? 1 : 0;
      this._dispatch(fanOrLoop, source, buffer, 1);
    } else if (!binding) {
      const data = new Uint32Array(size / 4);
      if (loop) {
        for (let i = 0; i < sub.count; i++) data[i] = sub.start + i;
        data[sub.count] = sub.start;
      } else {
        for (let i = 0; i < sub.count - 2; i++) {
          data[i * 3] = sub.start;
          data[i * 3 + 1] = sub.start + i + 1;
          data[i * 3 + 2] = sub.start + i + 2;
        }
      }
      this._hardware.device.queue.writeBuffer(buffer, 0, data);
    }
    return buffer;
  }

  expandedCount(sub: SubPrimitive): number {
    return this._indices.get(sub)!.count;
  }

  instances(binding: VertexBufferBinding, rate: number, count: number): GPUBuffer {
    const source = binding.buffer._platformBuffer as WebGPUBuffer;
    let rates = this._instances.get(binding);
    if (!rates) this._instances.set(binding, (rates = new Map()));
    const cached = rates.get(rate);
    if (
      cached &&
      cached.source === source._gpuBuffer &&
      cached.version === source._contentVersion &&
      cached.count === count
    )
      return cached.buffer;
    if (cached) this._hardware._retireBuffer(cached.buffer);
    const words = binding.stride / 4;
    const buffer = this._hardware.device.createBuffer({
      size: Math.max(4, count * binding.stride),
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.STORAGE
    });
    this._params[0] = count;
    this._params[1] = words;
    this._params[2] = rate;
    this._dispatch(repeatInstances, source, buffer, Math.ceil((count * words) / 64));
    rates.set(rate, { buffer, count, source: source._gpuBuffer, version: source._contentVersion });
    return buffer;
  }

  destroy(): void {
    for (const entry of this._indices.values()) this._hardware._retireBuffer(entry.buffer);
    for (const rates of this._instances.values())
      for (const entry of rates.values()) this._hardware._retireBuffer(entry.buffer);
    this._indices.clear();
    this._instances.clear();
  }

  private _dispatch(code: string, source: WebGPUBuffer, output: GPUBuffer, groups: number): void {
    const { device } = this._hardware;
    let pipelines = WebGPUPrimitiveEmulation._pipelines.get(device);
    if (!pipelines) WebGPUPrimitiveEmulation._pipelines.set(device, (pipelines = new Map()));
    let pipeline = pipelines.get(code);
    if (!pipeline) {
      pipeline = device.createComputePipeline({
        layout: "auto",
        compute: { module: device.createShaderModule({ code }), entryPoint: "expand" }
      });
      pipelines.set(code, pipeline);
    }
    const params = device.createBuffer({ size: 16, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    device.queue.writeBuffer(params, 0, this._params);
    const bindGroup = device.createBindGroup({
      layout: pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: source._gpuBuffer } },
        { binding: 1, resource: { buffer: output } },
        { binding: 2, resource: { buffer: params } }
      ]
    });
    const pass = this._hardware._getCommandEncoder().beginComputePass({ label: "Expand mesh input" });
    pass.setPipeline(pipeline);
    pass.setBindGroup(0, bindGroup);
    pass.dispatchWorkgroups(groups);
    pass.end();
    source._markUsed();
    this._hardware._retireBuffer(params);
  }
}
