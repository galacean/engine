// Local copy — keep numeric values in lockstep with
// `packages/core/src/shader/enums/RenderQueueType.ts`.
// See `packages/shader-compiler/src/enums/README.md` for the rationale.

/**
 * Render queue type.
 */
export enum RenderQueueType {
  /** Opaque queue. */
  Opaque,
  /** Opaque queue, alpha cutoff. */
  AlphaTest,
  /** Transparent queue, rendering from back to front to ensure correct rendering of transparent objects. */
  Transparent
}
