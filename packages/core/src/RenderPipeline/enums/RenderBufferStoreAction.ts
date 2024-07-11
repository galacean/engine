/**
 * This enum describes what should be done on the render target when the GPU is done rendering into it.
 */
export enum RenderBufferStoreAction {
  /**
   * Do nothing after rendering.
   */
  DontCare,

  /**
   * Blit the MSAA render target after rendering.
   */
  BlitMSAA
}
