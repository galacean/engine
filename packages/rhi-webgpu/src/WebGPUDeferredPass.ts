import type { RenderDrawCommands } from "./WebGPUDrawBundles";

export interface WebGPURenderCommands extends RenderDrawCommands {
  executeBundles(bundles: GPURenderBundle[]): void;
  setViewport(x: number, y: number, width: number, height: number, minDepth: number, maxDepth: number): void;
  setScissorRect(x: number, y: number, width: number, height: number): void;
  setStencilReference(value: number): void;
  setBlendConstant(value: GPUColorDict): void;
}

const enum State {
  Viewport = 1,
  Scissor = 2,
  Stencil = 4,
  Blend = 8
}
interface Span {
  flags: number;
  viewport: number[];
  scissor: number[];
  stencil: number;
  blend: GPUColorDict;
  bundles: GPURenderBundle[];
}

/** A pass with a final discard action may still be split by an upload or compute dispatch.
 * Retain native bundles until that boundary tells us whether the tile data must be stored. */
export class WebGPUDeferredPass implements WebGPURenderCommands {
  private readonly _spans: Span[] = [];
  private _spanCount = 0;
  private _descriptor: GPURenderPassDescriptor;
  private _layout: GPURenderBundleEncoderDescriptor;
  private _direct?: GPURenderBundleEncoder;

  constructor(private readonly _device: GPUDevice) {}

  begin(descriptor: GPURenderPassDescriptor, layout: GPURenderBundleEncoderDescriptor): void {
    this._descriptor = descriptor;
    this._layout = layout;
    this._spanCount = 0;
    this._nextSpan();
  }

  end(encoder: GPUCommandEncoder, discardColor: boolean, discardDepth: boolean, resolveColor: boolean): void {
    this._finishDirect();
    const descriptor = this._descriptor;
    if (discardColor)
      for (const color of descriptor.colorAttachments) {
        if (!color) continue;
        color.storeOp = "discard";
        if (!resolveColor) color.resolveTarget = undefined;
      }
    const depth = descriptor.depthStencilAttachment;
    if (discardDepth && depth) {
      if (depth.depthStoreOp) depth.depthStoreOp = "discard";
      if (depth.stencilStoreOp) depth.stencilStoreOp = "discard";
    }
    const pass = encoder.beginRenderPass(descriptor);
    for (let i = 0; i < this._spanCount; i++) {
      const span = this._spans[i],
        flags = span.flags;
      if (flags & State.Viewport) {
        const v = span.viewport;
        pass.setViewport(v[0], v[1], v[2], v[3], v[4], v[5]);
      }
      if (flags & State.Scissor) {
        const r = span.scissor;
        pass.setScissorRect(r[0], r[1], r[2], r[3]);
      }
      if (flags & State.Stencil) pass.setStencilReference(span.stencil);
      if (flags & State.Blend) pass.setBlendConstant(span.blend);
      if (span.bundles.length) pass.executeBundles(span.bundles);
      span.bundles.length = 0;
    }
    pass.end();
  }

  executeBundles(bundles: GPURenderBundle[]): void {
    this._finishDirect();
    const destination = this._spans[this._spanCount - 1].bundles;
    for (let i = 0; i < bundles.length; i++) destination.push(bundles[i]);
  }
  setViewport(x: number, y: number, width: number, height: number, min: number, max: number): void {
    const span = this._state(State.Viewport),
      v = span.viewport;
    v[0] = x;
    v[1] = y;
    v[2] = width;
    v[3] = height;
    v[4] = min;
    v[5] = max;
  }
  setScissorRect(x: number, y: number, width: number, height: number): void {
    const span = this._state(State.Scissor),
      r = span.scissor;
    r[0] = x;
    r[1] = y;
    r[2] = width;
    r[3] = height;
  }
  setStencilReference(value: number): void {
    this._state(State.Stencil).stencil = value;
  }
  setBlendConstant(value: GPUColorDict): void {
    const blend = this._state(State.Blend).blend;
    blend.r = value.r;
    blend.g = value.g;
    blend.b = value.b;
    blend.a = value.a;
  }

  // Scissored clears can issue a short private bundle outside the ordinary mesh draw stream.
  setPipeline(pipeline: GPURenderPipeline): void {
    this._encoder().setPipeline(pipeline);
  }
  setBindGroup(index: number, group: GPUBindGroup, offsets?: Uint32Array, start = 0, length = 0): void {
    const encoder = this._encoder();
    if (offsets) encoder.setBindGroup(index, group, offsets, start, length);
    else encoder.setBindGroup(index, group);
  }
  setVertexBuffer(slot: number, buffer: GPUBuffer): void {
    this._encoder().setVertexBuffer(slot, buffer);
  }
  setIndexBuffer(buffer: GPUBuffer, format: GPUIndexFormat): void {
    this._encoder().setIndexBuffer(buffer, format);
  }
  draw(count: number, instances?: number, start?: number, firstInstance?: number): void {
    this._encoder().draw(count, instances, start, firstInstance);
  }
  drawIndexed(count: number, instances?: number, start?: number, baseVertex?: number, firstInstance?: number): void {
    this._encoder().drawIndexed(count, instances, start, baseVertex, firstInstance);
  }

  private _encoder(): GPURenderBundleEncoder {
    return (this._direct ??= this._device.createRenderBundleEncoder(this._layout));
  }
  private _finishDirect(): void {
    if (!this._direct) return;
    this._spans[this._spanCount - 1].bundles.push(this._direct.finish());
    this._direct = undefined;
  }
  private _state(flag: State): Span {
    this._finishDirect();
    let span = this._spans[this._spanCount - 1];
    if (span.bundles.length) span = this._nextSpan();
    span.flags |= flag;
    return span;
  }
  private _nextSpan(): Span {
    const i = this._spanCount++;
    const span = (this._spans[i] ??= {
      flags: 0,
      viewport: [],
      scissor: [],
      stencil: 0,
      blend: { r: 0, g: 0, b: 0, a: 0 },
      bundles: []
    });
    span.flags = 0;
    return span;
  }
}
