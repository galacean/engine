import { TextureFormat } from "@galacean/engine-core";
import type { WebGPUGraphicDevice } from "./WebGPUGraphicDevice";

const triangle = `
@vertex fn vs(@builtin(vertex_index) i: u32) -> @builtin(position) vec4f {
  let p = vec2f(f32((i << 1u) & 2u), f32(i & 2u));
  return vec4f(p * 2.0 - 1.0, 0.0, 1.0);
}`;
const transferBindings = `
@group(0) @binding(0) var<storage, read> pixels: array<vec2u>;
@group(0) @binding(1) var<uniform> rect: vec4u;
fn pixelAt(p: vec4f) -> vec2u {
  let xy = vec2u(p.xy) - rect.xy;
  return pixels[xy.y * rect.z + xy.x];
}`;

/** WebGPU depth and stencil aspects cannot be copied as portable packed pixels. */
export class WebGPUDepthTransfer {
  private static readonly _devices = new WeakMap<GPUDevice, WebGPUDepthTransfer>();
  private readonly _reads = new Map<GPUTextureFormat, GPUComputePipeline>();
  private readonly _writes = new Map<string, GPURenderPipeline>();
  private readonly _params = new Uint32Array(4);

  static forDevice(hardware: WebGPUGraphicDevice): WebGPUDepthTransfer {
    let transfer = this._devices.get(hardware.device);
    if (!transfer) this._devices.set(hardware.device, (transfer = new WebGPUDepthTransfer()));
    return transfer;
  }

  read(
    hardware: WebGPUGraphicDevice,
    texture: GPUTexture,
    format: TextureFormat,
    mip: number,
    layer: number,
    x: number,
    y: number,
    width: number,
    height: number,
    out: ArrayBufferView
  ): Promise<void> {
    let staging: GPUBuffer, output: GPUBuffer, params: GPUBuffer;
    return new Promise<void>((resolve) => {
      const { device } = hardware;
      const hasDepth = texture.format.startsWith("depth"),
        hasStencil = texture.format.includes("stencil");
      let pipeline = this._reads.get(texture.format);
      if (!pipeline) {
        const code = `
          @group(0) @binding(0) var<storage, read_write> pixels: array<vec2u>;
          @group(0) @binding(1) var<uniform> rect: vec4u;
          ${hasDepth ? "@group(0) @binding(2) var depthImage: texture_depth_2d;" : ""}
          ${hasStencil ? "@group(0) @binding(3) var stencilImage: texture_2d<u32>;" : ""}
          @compute @workgroup_size(8,8) fn main(@builtin(global_invocation_id) id: vec3u) {
            if (id.x >= rect.z || id.y >= rect.w) { return; }
            let xy = vec2i(id.xy + rect.xy);
            pixels[id.y * rect.z + id.x] = vec2u(
              ${hasDepth ? "bitcast<u32>(textureLoad(depthImage,xy,0))" : "0u"},
              ${hasStencil ? "textureLoad(stencilImage,xy,0).r" : "0u"});
          }`;
        pipeline = device.createComputePipeline({
          layout: "auto",
          compute: { module: device.createShaderModule({ code }), entryPoint: "main" }
        });
        this._reads.set(texture.format, pipeline);
      }
      const entries: GPUBindGroupEntry[] = [];
      const view: GPUTextureViewDescriptor = {
        dimension: "2d",
        baseArrayLayer: layer,
        arrayLayerCount: 1,
        baseMipLevel: mip,
        mipLevelCount: 1
      };
      if (hasDepth) entries.push({ binding: 2, resource: texture.createView({ ...view, aspect: "depth-only" }) });
      if (hasStencil) entries.push({ binding: 3, resource: texture.createView({ ...view, aspect: "stencil-only" }) });
      const rowCount = Math.min(height, Math.floor(device.limits.maxStorageBufferBindingSize / (width * 8)));
      if (rowCount <= 0) throw new RangeError("Depth readback row exceeds the storage binding limit.");
      const size = rowCount * width * 8;
      output = device.createBuffer({ size, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC });
      staging = device.createBuffer({ size, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
      entries.push({ binding: 0, resource: { buffer: output } });
      params = device.createBuffer({ size: 16, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
      entries.push({ binding: 1, resource: { buffer: params } });
      const group = device.createBindGroup({ layout: pipeline.getBindGroupLayout(0), entries });
      const dst = new DataView(out.buffer, out.byteOffset, out.byteLength);
      const readRows = (row: number): Promise<void> => {
        const rows = Math.min(rowCount, height - row);
        device.queue.writeBuffer(params, 0, new Uint32Array([x, y + row, width, rows]));
        const pass = hardware._beginComputePass();
        pass.setPipeline(pipeline);
        pass.setBindGroup(0, group);
        pass.dispatchWorkgroups(Math.ceil(width / 8), Math.ceil(rows / 8));
        hardware._getCommandEncoder().copyBufferToBuffer(output, 0, staging, 0, rows * width * 8);
        hardware.flush();
        return staging.mapAsync(GPUMapMode.READ).then(() => {
          const values = new DataView(staging.getMappedRange());
          for (let i = 0; i < rows * width; i++) {
            WebGPUDepthTransfer._pack(
              format,
              dst,
              row * width + i,
              values.getFloat32(i * 8, true),
              values.getUint32(i * 8 + 4, true)
            );
          }
          staging.unmap();
          const next = row + rows;
          if (next < height) return readRows(next);
        });
      };
      resolve(readRows(0));
    }).finally(() => {
      staging?.destroy();
      output?.destroy();
      params?.destroy();
    });
  }

  write(
    hardware: WebGPUGraphicDevice,
    texture: GPUTexture,
    format: TextureFormat,
    mip: number,
    layer: number,
    x: number,
    y: number,
    width: number,
    height: number,
    layers: number,
    input: ArrayBufferView
  ): void {
    const { device } = hardware;
    const depth = texture.format.startsWith("depth"),
      stencil = texture.format.includes("stencil");
    const src = new DataView(input.buffer, input.byteOffset, input.byteLength);
    const maxRows = Math.floor(device.limits.maxStorageBufferBindingSize / (width * 8));
    for (let slice = 0; slice < layers; slice++) {
      const view = texture.createView({
        dimension: "2d",
        baseArrayLayer: layer + slice,
        arrayLayerCount: 1,
        baseMipLevel: mip,
        mipLevelCount: 1
      });
      const ds: GPURenderPassDepthStencilAttachment = { view };
      if (depth) {
        ds.depthLoadOp = "load";
        ds.depthStoreOp = "store";
      }
      if (stencil) {
        ds.stencilLoadOp = "load";
        ds.stencilStoreOp = "store";
      }
      for (let row = 0; row < height; row += maxRows) {
        const rows = Math.min(maxRows, height - row),
          count = rows * width;
        const data = device.createBuffer({ size: count * 8, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
        const bytes = new Uint8Array(count * 8);
        const dst = new DataView(bytes.buffer);
        for (let i = 0; i < count; i++)
          WebGPUDepthTransfer._unpack(format, src, (slice * height + row) * width + i, dst, i * 8);
        device.queue.writeBuffer(data, 0, bytes);
        const params = device.createBuffer({ size: 16, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
        this._params[0] = x;
        this._params[1] = y + row;
        this._params[2] = width;
        this._params[3] = rows;
        device.queue.writeBuffer(params, 0, this._params);
        const pass = hardware
          ._getCommandEncoder()
          .beginRenderPass({ colorAttachments: [], depthStencilAttachment: ds });
        pass.setScissorRect(x, y + row, width, rows);
        // Pass zero writes depth and clears stencil inside the destination rectangle.
        // Each following draw replaces one set stencil bit while preserving the others.
        for (let bit = 0; bit <= (stencil ? 128 : 0); bit = bit ? bit * 2 : 1) {
          const pipeline = this._writePipeline(device, texture.format, bit);
          pass.setPipeline(pipeline);
          if (stencil) pass.setStencilReference(bit);
          if (depth || bit)
            pass.setBindGroup(
              0,
              device.createBindGroup({
                layout: pipeline.getBindGroupLayout(0),
                entries: [
                  { binding: 0, resource: { buffer: data } },
                  { binding: 1, resource: { buffer: params } }
                ]
              })
            );
          pass.draw(3);
        }
        pass.end();
        hardware._retireBuffer(data);
        hardware._retireBuffer(params);
      }
    }
  }

  private _writePipeline(device: GPUDevice, format: GPUTextureFormat, bit: number): GPURenderPipeline {
    const key = format + "/" + bit;
    let pipeline = this._writes.get(key);
    if (pipeline) return pipeline;
    const depth = format.startsWith("depth") && bit === 0;
    const stencil = format.includes("stencil");
    const result = depth ? "-> @builtin(frag_depth) f32" : "";
    const body = depth
      ? "return bitcast<f32>(pixelAt(p).x);"
      : bit
        ? `if ((pixelAt(p).y & ${bit}u)==0u) {discard;}`
        : "";
    const module = device.createShaderModule({
      code: triangle + transferBindings + `@fragment fn fs(@builtin(position) p: vec4f) ${result} { ${body} }`
    });
    const face: GPUStencilFaceState = stencil ? { passOp: "replace" } : {};
    pipeline = device.createRenderPipeline({
      layout: "auto",
      vertex: { module, entryPoint: "vs" },
      fragment: { module, entryPoint: "fs", targets: [] },
      depthStencil: {
        format,
        depthCompare: "always",
        depthWriteEnabled: depth,
        stencilFront: face,
        stencilBack: face,
        stencilWriteMask: stencil ? bit || 255 : 0
      }
    });
    this._writes.set(key, pipeline);
    return pipeline;
  }

  private static _pack(format: TextureFormat, out: DataView, i: number, depth: number, stencil: number): void {
    switch (format) {
      case TextureFormat.Depth16:
        out.setUint16(i * 2, Math.round(depth * 65535), true);
        break;
      case TextureFormat.Depth24:
        out.setUint32(i * 4, Math.round(depth * 0xffffffff), true);
        break;
      case TextureFormat.Stencil:
        out.setUint8(i, stencil);
        break;
      case TextureFormat.DepthStencil:
      case TextureFormat.Depth24Stencil8:
        out.setUint32(i * 4, Math.round(depth * 0xffffff) * 256 + stencil, true);
        break;
      case TextureFormat.Depth32Stencil8:
        out.setFloat32(i * 8, depth, true);
        out.setUint32(i * 8 + 4, stencil, true);
        break;
      default:
        out.setFloat32(i * 4, depth, true);
    }
  }

  private static _unpack(format: TextureFormat, src: DataView, i: number, dst: DataView, offset: number): void {
    let depth = 0,
      stencil = 0;
    switch (format) {
      case TextureFormat.Depth16:
        depth = src.getUint16(i * 2, true) / 65535;
        break;
      case TextureFormat.Depth24:
        depth = src.getUint32(i * 4, true) / 0xffffffff;
        break;
      case TextureFormat.Stencil:
        stencil = src.getUint8(i);
        break;
      case TextureFormat.DepthStencil:
      case TextureFormat.Depth24Stencil8: {
        const value = src.getUint32(i * 4, true);
        depth = (value >>> 8) / 0xffffff;
        stencil = value & 255;
        break;
      }
      case TextureFormat.Depth32Stencil8:
        depth = src.getFloat32(i * 8, true);
        stencil = src.getUint32(i * 8 + 4, true) & 255;
        break;
      default:
        depth = src.getFloat32(i * 4, true);
    }
    dst.setFloat32(offset, depth, true);
    dst.setUint32(offset + 4, stencil, true);
  }
}
