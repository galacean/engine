/**
 * Action to take on a render target attachment's contents when ending a render pass.
 * @remarks
 * Mirrors WebGPU's `GPUStoreOp` (`"store" | "discard"`) plus MSAA resolve intent (`resolveTarget`).
 */
export enum RenderTargetStoreAction {
  /** Keep attachment contents in memory for subsequent passes. */
  Store = 0,
  /** Discard attachment contents when ending the pass so TBDR GPUs skip flushing to memory. */
  Discard = 1,
  /** Resolve MSAA samples to the color texture and discard transient MSAA samples afterward. */
  Resolve = 2,
  /** Resolve MSAA samples to the color texture while keeping MSAA samples for subsequent passes. */
  StoreAndResolve = 3
}
