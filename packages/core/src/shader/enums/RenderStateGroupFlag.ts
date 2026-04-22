/**
 * @internal
 * Bitmask flags identifying which render state groups a shader manages.
 */
export enum RenderStateGroupFlag {
  /** Blend state (enabled, blend factors, blend operations, color write mask, blend color, alpha to coverage). */
  Blend = 0x1,
  /** Depth state (enabled, write enabled, compare function). */
  Depth = 0x2,
  /** Stencil state (enabled, reference, mask, compare/pass/fail/zFail operations). */
  Stencil = 0x4,
  /** Raster state (cull mode, depth bias, slope scaled depth bias). */
  Raster = 0x8,
  /** Render queue type. */
  RenderQueueType = 0x10
}
