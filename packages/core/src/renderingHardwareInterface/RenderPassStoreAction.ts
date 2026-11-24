/**
 * Action to take on a render pass attachment's contents when ending a render pass.
 * @remarks
 * Aligns with Metal `MTLStoreAction` and WebGPU `GPUStoreOp` (`"store" | "discard"`) plus MSAA `resolveTarget`.
 * `Resolve` and `StoreAndResolve` resolve multisampled (`antiAliasing > 1`) attachments backed by a resolve texture
 * (color textures or depth textures on WebGL2); on single-sample targets or attachments without a resolve texture
 * they behave like `Store`.
 */
export enum RenderPassStoreAction {
  /** Keep attachment contents in memory for subsequent passes. */
  Store = 0,
  /** Discard attachment contents when ending the pass so TBDR GPUs skip flushing to memory. */
  Discard = 1,
  /** Resolve MSAA samples to the backing texture and discard transient MSAA samples afterward. */
  Resolve = 2,
  /** Resolve MSAA samples to the backing texture while keeping MSAA samples for subsequent passes. */
  StoreAndResolve = 3
}
