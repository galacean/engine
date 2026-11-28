import { Color, Vector4 } from "@galacean/engine-math";
import type { RenderTarget, TextureCubeFace } from "../texture";
import { RenderPassLoadAction } from "./RenderPassLoadAction";
import { RenderPassStoreAction } from "./RenderPassStoreAction";

/**
 * Reusable render pass descriptor defining target binding and attachment load/store actions.
 * @remarks
 * Holds target binding, viewport, and independent color / depth / stencil load & store actions
 * so callers can reuse a single instance across render passes with zero per-frame allocations.
 * @internal
 */
export class RenderPassDescriptor {
  /** Target framebuffer to render into, or `null` for the default canvas backbuffer. */
  renderTarget: RenderTarget | null = null;
  /** Normalized viewport rectangle `(x, y, width, height)` in `[0, 1]` range. */
  viewport: Vector4 = new Vector4(0, 0, 1, 1);
  /** Whether projection Y is flipped for this pass (typically `true` for offscreen 2D render targets in WebGL). */
  isFlipProjection: boolean = false;
  /** Target mipmap level to write to. */
  mipLevel: number = 0;
  /** Target cube map face index when rendering to a `TextureCube`. */
  faceIndex?: TextureCubeFace = undefined;

  /** Load action for the color attachment when beginning the render pass. */
  colorLoadAction: RenderPassLoadAction = RenderPassLoadAction.Load;
  /** Store action for the color attachment when ending the render pass. */
  colorStoreAction: RenderPassStoreAction = RenderPassStoreAction.Store;
  /** Clear color used when `colorLoadAction` is `RenderPassLoadAction.Clear`. */
  clearColor: Color = new Color(0, 0, 0, 0);

  /** Load action for the depth attachment when beginning the render pass. */
  depthLoadAction: RenderPassLoadAction = RenderPassLoadAction.Load;
  /** Store action for the depth attachment when ending the render pass. */
  depthStoreAction: RenderPassStoreAction = RenderPassStoreAction.Store;
  /** Clear depth value used when `depthLoadAction` is `RenderPassLoadAction.Clear`. */
  clearDepth: number = 1;

  /** Load action for the stencil attachment when beginning the render pass. */
  stencilLoadAction: RenderPassLoadAction = RenderPassLoadAction.Load;
  /** Store action for the stencil attachment when ending the render pass. */
  stencilStoreAction: RenderPassStoreAction = RenderPassStoreAction.Store;
  /** Clear stencil value used when `stencilLoadAction` is `RenderPassLoadAction.Clear`. */
  clearStencil: number = 0;

  /**
   * Reset target binding and all attachment actions to safe defaults (`Load` / `Store`) without allocating.
   * @param renderTarget - Target framebuffer to bind, or `null` for the default backbuffer
   * @param viewport - Optional normalized viewport rectangle (defaults to full target `(0, 0, 1, 1)`)
   * @param isFlipProjection - Whether projection Y is flipped (defaults to `!!renderTarget`)
   * @param mipLevel - Target mipmap level (defaults to `0`)
   * @param faceIndex - Target cube face when rendering to a `TextureCube`
   * @returns This descriptor instance for chaining
   */
  reset(
    renderTarget: RenderTarget | null = null,
    viewport?: Vector4,
    isFlipProjection: boolean = !!renderTarget,
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

    this.colorLoadAction = RenderPassLoadAction.Load;
    this.colorStoreAction = RenderPassStoreAction.Store;
    this.clearColor.set(0, 0, 0, 0);

    this.depthLoadAction = RenderPassLoadAction.Load;
    this.depthStoreAction = RenderPassStoreAction.Store;
    this.clearDepth = 1;

    this.stencilLoadAction = RenderPassLoadAction.Load;
    this.stencilStoreAction = RenderPassStoreAction.Store;
    this.clearStencil = 0;
    return this;
  }
}
