/**
 * Action to take on a render pass attachment's existing contents when beginning a render pass.
 * @remarks
 * - `Load`: Preserve existing contents (required for blending, `discard`, or partial-region updates).
 * - `Clear`: Deterministically clear untouched pixels to the descriptor's clear value (e.g. 3D scene background, depth, shadow maps).
 * - `DontCare`: Discard stale contents when the pass overwrites the entire target without reading old values (e.g. full-screen post-processing, Bloom, SSAO).
 *   On WebGL2, Apple/Metal backends translate `DontCare` to `gl.clear()` (hardware `MTLLoadActionClear`, avoiding `RobustResourceInit` CPU stalls),
 *   while non-Apple GLES backends (Adreno / Maleoon / Mali) translate `DontCare` to `gl.invalidateFramebuffer()` (avoiding format-specific `gl.clear` slow paths such as Adreno `R11F_G11F_B10F`).
 *   On WebGPU, `DontCare` maps directly to `loadOp: "clear"`.
 */
export enum RenderPassLoadAction {
  /** Preserve existing attachment contents when beginning the render pass. */
  Load = 0,
  /** Clear attachment contents to the descriptor's clear value when beginning the render pass. */
  Clear = 1,
  /** Discard existing attachment contents without requiring a deterministic clear value. */
  DontCare = 2
}
