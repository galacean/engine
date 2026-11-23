/**
 * Action to take on a render buffer's contents when leaving or resolving a render target.
 * @internal
 */
export enum RenderBufferStoreAction {
  /** Keep buffer contents in memory for subsequent passes. */
  Store = 0,
  /** Discard buffer contents when leaving the render target so TBDR GPUs skip flushing to memory. */
  DontCare = 1,
  /** Resolve MSAA samples to the color texture and discard transient MSAA samples afterward. */
  Resolve = 2,
  /** Resolve MSAA samples to the color texture while keeping MSAA samples for subsequent draws. */
  StoreAndResolve = 3
}
