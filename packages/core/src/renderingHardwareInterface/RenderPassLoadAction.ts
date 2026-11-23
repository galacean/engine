/**
 * Action to take on a render pass attachment's existing contents when beginning a render pass.
 * @remarks
 * Aligns with WebGPU `GPULoadOp` (`"load" | "clear"`). Use `Clear` for full-target overwrites so mobile TBDR GPUs
 * can skip loading stale attachment memory into on-chip tile cache; keep `Load` when blending, using `discard`, or
 * writing only a sub-region of the target.
 */
export enum RenderPassLoadAction {
  /** Preserve existing attachment contents when beginning the render pass. */
  Load = 0,
  /** Clear attachment contents when beginning the render pass. */
  Clear = 1
}
