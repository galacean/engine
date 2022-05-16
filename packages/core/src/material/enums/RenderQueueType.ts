/**
 * Render queue type.
 */
export enum RenderQueueType {
  /** Opaque queue. */
  Opaque = "Opaque",
  /** Opaque queue, alpha cutoff. */
  AlphaTest = "AlphaTest",
  /** Transparent queue, rendering from back to front to ensure correct rendering of transparent objects. */
  Transparent = "Transparent"
}
