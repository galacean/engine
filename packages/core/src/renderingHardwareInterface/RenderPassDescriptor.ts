import { Color, Vector4 } from "@galacean/engine-math";
import type { RenderTarget, TextureCubeFace } from "../texture";
import { RenderTargetLoadAction } from "./RenderTargetLoadAction";
import { RenderTargetStoreAction } from "./RenderTargetStoreAction";

/**
 * Reusable render pass descriptor aligned with WebGPU `GPURenderPassDescriptor`.
 * @remarks
 * Holds target binding, viewport, and independent color / depth / stencil load & store actions
 * so callers can reuse a single instance per pass with zero per-frame allocations.
 * @internal
 */
export class RenderPassDescriptor {
  renderTarget: RenderTarget | null = null;
  viewport: Vector4 = new Vector4(0, 0, 1, 1);
  isFlipProjection: boolean = false;
  mipLevel: number = 0;
  faceIndex?: TextureCubeFace = undefined;

  colorLoadAction: RenderTargetLoadAction = RenderTargetLoadAction.Load;
  colorStoreAction: RenderTargetStoreAction = RenderTargetStoreAction.Store;
  clearColor: Color = new Color(0, 0, 0, 0);

  depthLoadAction: RenderTargetLoadAction = RenderTargetLoadAction.Load;
  depthStoreAction: RenderTargetStoreAction = RenderTargetStoreAction.Store;
  clearDepth: number = 1;

  stencilLoadAction: RenderTargetLoadAction = RenderTargetLoadAction.Load;
  stencilStoreAction: RenderTargetStoreAction = RenderTargetStoreAction.Store;
  clearStencil: number = 0;

  /**
   * Reset target binding and all attachment actions to safe defaults (`Load` / `Store`) without allocating.
   */
  reset(
    renderTarget: RenderTarget | null = null,
    viewport?: Vector4,
    isFlipProjection: boolean = false,
    mipLevel: number = 0,
    faceIndex?: TextureCubeFace
  ): this {
    this.renderTarget = renderTarget;
    if (viewport) {
      this.viewport.copyFrom(viewport);
    } else {
      this.viewport.set(0, 0, 1, 1);
    }
    this.isFlipProjection = isFlipProjection;
    this.mipLevel = mipLevel;
    this.faceIndex = faceIndex;

    this.colorLoadAction = RenderTargetLoadAction.Load;
    this.colorStoreAction = RenderTargetStoreAction.Store;
    this.clearColor.set(0, 0, 0, 0);

    this.depthLoadAction = RenderTargetLoadAction.Load;
    this.depthStoreAction = RenderTargetStoreAction.Store;
    this.clearDepth = 1;

    this.stencilLoadAction = RenderTargetLoadAction.Load;
    this.stencilStoreAction = RenderTargetStoreAction.Store;
    this.clearStencil = 0;
    return this;
  }
}
