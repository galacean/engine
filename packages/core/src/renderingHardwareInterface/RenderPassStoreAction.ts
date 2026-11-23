/**
 * Action to take on a render pass attachment's contents when ending a render pass.
 * @remarks
 * Aligns with Metal `MTLStoreAction` and WebGPU `GPUStoreOp` (`"store" | "discard"`) plus MSAA `resolveTarget`.
 * `Resolve` and `StoreAndResolve` apply to multisampled (`antiAliasing > 1`) color attachments; on single-sample
 * targets or depth/stencil attachments they behave like `Store`.
 */
export enum RenderPassStoreAction {
  /** Keep attachment contents in memory for subsequent passes. */
  Store = 0,
  /** Discard attachment contents when ending the pass so TBDR GPUs skip flushing to memory. */
  Discard = 1,
  /** Resolve MSAA color samples to the color texture and discard transient MSAA samples afterward. */
  Resolve = 2,
  /** Resolve MSAA color samples to the color texture while keeping MSAA samples for subsequent passes. */
  StoreAndResolve = 3
}
