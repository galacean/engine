/**
 * Action to take on a render buffer's existing contents when activating a render target.
 * @internal
 */
export enum RenderBufferLoadAction {
  /** Preserve existing buffer contents when binding the render target. */
  Load = 0,
  /** Discard existing buffer contents so TBDR GPUs can skip loading stale memory into tile cache. */
  DontCare = 1
}
