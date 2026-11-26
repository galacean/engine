import { CameraClearFlags } from "@galacean/engine-core";
import { Color, Vector4 } from "@galacean/engine-math";
import type { WebGPURenderCommands } from "./WebGPUDeferredPass";
import type { WebGPUGraphicDevice } from "./WebGPUGraphicDevice";

const triangle = `
@vertex fn vertexMain(@builtin(vertex_index) i: u32) -> @builtin(position) vec4f {
  let p = vec2f(f32((i << 1u) & 2u), f32(i & 2u));
  return vec4f(p * 2.0 - 1.0, 1.0, 1.0);
}`;

/** Backend attachment operations that need a raster pass, including scissored clears. */
export class WebGPUAttachmentOps {
  private readonly _pipelines = new Map<string, GPURenderPipeline>();
  private readonly _clearColor = new Float32Array(4);
  private readonly _copyParams = new Float32Array(4);
  constructor(public deviceOwner: WebGPUGraphicDevice) {}

  clear(
    pass: WebGPURenderCommands,
    target: ReturnType<WebGPUGraphicDevice["_getAttachmentState"]>,
    rect: Vector4,
    flags: CameraClearFlags,
    color: Color
  ): void {
    const device = this.deviceOwner.device;
    const key = "clear/" + target.key + "/" + flags;
    let pipeline = this._pipelines.get(key);
    if (!pipeline) {
      const fields = target.colorFormats.map(
        (f, i) => "@location(" + i + ") c" + i + ": " + WebGPUAttachmentOps._colorType(f)
      );
      const body = fields.length
        ? "struct Output {" +
          fields.join(",") +
          "} @fragment fn fragmentMain() -> Output { return Output(" +
          target.colorFormats.map((f) => WebGPUAttachmentOps._colorType(f) + "(clearColor)").join(",") +
          "); }"
        : "@fragment fn fragmentMain() {}";
      const module = device.createShaderModule({
        code: triangle + "\n@group(0) @binding(0) var<uniform> clearColor: vec4f;\n" + body
      });
      const depth = target.depthStencilFormat;
      const stencil = depth?.includes("stencil") && !!(flags & CameraClearFlags.Stencil);
      const face: GPUStencilFaceState = stencil ? { compare: "always", passOp: "replace" } : {};
      pipeline = device.createRenderPipeline({
        layout: "auto",
        vertex: { module, entryPoint: "vertexMain" },
        fragment: {
          module,
          entryPoint: "fragmentMain",
          targets: target.colorFormats.map((format) => ({
            format,
            writeMask: flags & CameraClearFlags.Color ? GPUColorWrite.ALL : 0
          }))
        },
        depthStencil: depth
          ? {
              format: depth,
              depthCompare: "always",
              depthWriteEnabled: depth !== "stencil8" && !!(flags & CameraClearFlags.Depth),
              stencilFront: face,
              stencilBack: face,
              stencilWriteMask: stencil ? 0xff : 0
            }
          : undefined,
        multisample: { count: target.sampleCount }
      });
      this._pipelines.set(key, pipeline);
    }
    pass.setScissorRect(rect.x, rect.y, rect.z, rect.w);
    pass.setViewport(rect.x, rect.y, rect.z, rect.w, 0, 1);
    pass.setStencilReference(0);
    pass.setPipeline(pipeline);
    if (target.colorFormats.length) {
      const buffer = device.createBuffer({ size: 16, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
      this._clearColor[0] = color.r;
      this._clearColor[1] = color.g;
      this._clearColor[2] = color.b;
      this._clearColor[3] = color.a;
      device.queue.writeBuffer(buffer, 0, this._clearColor);
      pass.setBindGroup(
        0,
        device.createBindGroup({
          layout: pipeline.getBindGroupLayout(0),
          entries: [{ binding: 0, resource: { buffer } }]
        })
      );
      this.deviceOwner._retireBuffer(buffer);
    }
    pass.draw(3);
  }

  copyColor(
    source: GPUTexture,
    destination: GPUTexture,
    viewport: Vector4,
    sourceView?: GPUTextureViewDescriptor,
    destinationView?: GPUTextureViewDescriptor
  ): void {
    const mip = sourceView?.baseMipLevel ?? 0,
      layer = sourceView?.baseArrayLayer ?? 0;
    const destMip = destinationView?.baseMipLevel ?? 0,
      destLayer = destinationView?.baseArrayLayer ?? 0;
    const x = Math.floor(viewport.x * Math.max(1, source.width >> mip));
    const y = Math.floor(viewport.y * Math.max(1, source.height >> mip));
    if (
      source.format === destination.format &&
      source.sampleCount === 1 &&
      destination.sampleCount === 1 &&
      source.usage & GPUTextureUsage.COPY_SRC &&
      destination.usage & GPUTextureUsage.COPY_DST
    ) {
      this.deviceOwner
        ._getCommandEncoder()
        .copyTextureToTexture(
          { texture: source, origin: [x, y, layer], mipLevel: mip },
          { texture: destination, origin: [0, 0, destLayer], mipLevel: destMip },
          [Math.max(1, destination.width >> destMip), Math.max(1, destination.height >> destMip)]
        );
      return;
    }
    this._copyAspect(source, destination, x, y, "all", 0, destMip, destLayer, sourceView);
  }

  copyDepth(
    source: GPUTexture,
    destination: GPUTexture,
    viewport: Vector4,
    flags: CameraClearFlags,
    destinationMip = 0,
    destinationLayer = 0,
    sourceView?: GPUTextureViewDescriptor,
    destinationRect?: Vector4
  ): void {
    const mip = sourceView?.baseMipLevel ?? 0;
    const x = Math.floor(viewport.x * Math.max(1, source.width >> mip)),
      y = Math.floor(viewport.y * Math.max(1, source.height >> mip));
    if (
      !(flags & CameraClearFlags.Depth) &&
      source.format.startsWith("depth") &&
      destination.format.startsWith("depth")
    ) {
      this._copyAspect(
        source,
        destination,
        x,
        y,
        "depth-only",
        0,
        destinationMip,
        destinationLayer,
        sourceView,
        destinationRect
      );
    }
    if (
      !(flags & CameraClearFlags.Stencil) &&
      source.format.includes("stencil") &&
      destination.format.includes("stencil")
    ) {
      // Seed each destination stencil bit from the selected source sample.
      for (let bit = 1; bit <= 128; bit *= 2)
        this._copyAspect(
          source,
          destination,
          x,
          y,
          "stencil-only",
          bit,
          destinationMip,
          destinationLayer,
          sourceView,
          destinationRect
        );
    }
  }

  private _copyAspect(
    source: GPUTexture,
    destination: GPUTexture,
    x: number,
    y: number,
    aspect: GPUTextureAspect,
    bit = 0,
    destinationMip = 0,
    destinationLayer = 0,
    sourceView?: GPUTextureViewDescriptor,
    destinationRect?: Vector4
  ): void {
    const device = this.deviceOwner.device;
    const color = aspect === "all",
      stencil = aspect === "stencil-only";
    const key = [
      "copy",
      source.format,
      destination.format,
      aspect,
      source.sampleCount,
      destination.sampleCount,
      bit
    ].join("/");
    let pipeline = this._pipelines.get(key);
    if (!pipeline) {
      const texType = color
        ? source.format.endsWith("uint")
          ? "u32"
          : source.format.endsWith("sint")
            ? "i32"
            : "f32"
        : stencil
          ? "u32"
          : undefined;
      const tex =
        (texType ? "texture_" : "texture_depth_") +
        (source.sampleCount > 1 ? "multisampled_" : "") +
        "2d" +
        (texType ? "<" + texType + ">" : "");
      const result = color
        ? "@location(0) " + WebGPUAttachmentOps._colorType(destination.format)
        : "@builtin(frag_depth) f32";
      const frag = stencil
        ? "{ if ((textureLoad(image,vec2i(floor(p.xy*transform.xy+transform.zw)),0).r & " +
          bit +
          "u) == 0u) { discard; } }"
        : "-> " + result + " { return textureLoad(image,vec2i(floor(p.xy*transform.xy+transform.zw)),0); }";
      const module = device.createShaderModule({
        code:
          triangle +
          "\n@group(0) @binding(0) var image:" +
          tex +
          "; @group(0) @binding(1) var<uniform> transform: vec4f; @fragment fn frag(@builtin(position) p:vec4f) " +
          frag
      });
      const face: GPUStencilFaceState = stencil ? { compare: "always", passOp: "replace" } : {};
      pipeline = device.createRenderPipeline({
        layout: "auto",
        vertex: { module, entryPoint: "vertexMain" },
        fragment: { module, entryPoint: "frag", targets: color ? [{ format: destination.format }] : [] },
        depthStencil: color
          ? undefined
          : {
              format: destination.format,
              depthCompare: "always",
              depthWriteEnabled: !stencil,
              stencilFront: face,
              stencilBack: face,
              stencilWriteMask: bit
            },
        multisample: { count: destination.sampleCount }
      });
      this._pipelines.set(key, pipeline);
    }
    const params = device.createBuffer({ size: 16, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    const mip = sourceView?.baseMipLevel ?? 0;
    const sx = destinationRect ? Math.max(1, source.width >> mip) / destinationRect.z : 1;
    const sy = destinationRect ? Math.max(1, source.height >> mip) / destinationRect.w : 1;
    this._copyParams[0] = sx;
    this._copyParams[1] = sy;
    this._copyParams[2] = x - (destinationRect?.x ?? 0) * sx;
    this._copyParams[3] = y - (destinationRect?.y ?? 0) * sy;
    device.queue.writeBuffer(params, 0, this._copyParams);
    const view = destination.createView({
      dimension: "2d",
      baseMipLevel: destinationMip,
      mipLevelCount: 1,
      baseArrayLayer: destinationLayer,
      arrayLayerCount: 1
    });
    const ds: GPURenderPassDepthStencilAttachment = { view };
    if (destination.format.startsWith("depth")) Object.assign(ds, { depthLoadOp: "load", depthStoreOp: "store" });
    if (destination.format.includes("stencil"))
      Object.assign(ds, {
        stencilLoadOp: stencil && bit === 1 ? "clear" : "load",
        stencilClearValue: 0,
        stencilStoreOp: "store"
      });
    const pass = this.deviceOwner._getCommandEncoder().beginRenderPass({
      colorAttachments: color ? [{ view, loadOp: "load", storeOp: "store" }] : [],
      depthStencilAttachment: color ? undefined : ds
    });
    pass.setPipeline(pipeline);
    pass.setBindGroup(
      0,
      device.createBindGroup({
        layout: pipeline.getBindGroupLayout(0),
        entries: [
          {
            binding: 0,
            resource: source.createView({
              aspect,
              dimension: "2d",
              baseMipLevel: sourceView?.baseMipLevel,
              baseArrayLayer: sourceView?.baseArrayLayer,
              mipLevelCount: 1,
              arrayLayerCount: 1
            })
          },
          { binding: 1, resource: { buffer: params } }
        ]
      })
    );
    if (destinationRect) {
      pass.setViewport(destinationRect.x, destinationRect.y, destinationRect.z, destinationRect.w, 0, 1);
      pass.setScissorRect(destinationRect.x, destinationRect.y, destinationRect.z, destinationRect.w);
    }
    if (stencil) pass.setStencilReference(bit);
    pass.draw(3);
    pass.end();
    this.deviceOwner._retireBuffer(params);
  }

  private static _colorType(format: GPUTextureFormat): string {
    return format.endsWith("uint") ? "vec4u" : format.endsWith("sint") ? "vec4i" : "vec4f";
  }
  destroy(): void {
    this._pipelines.clear();
  }
}
