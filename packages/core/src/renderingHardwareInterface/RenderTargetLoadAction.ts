/**
 * Action to take on a render target attachment's existing contents when beginning a render pass.
 * @remarks
 * Mirrors WebGPU's `GPULoadOp` (`"load" | "clear"`). On WebGL2 (especially iOS WebKit / ANGLE-Metal),
 * full-target `gl.clear()` maps to hardware `MTLLoadActionClear` (zero DRAM tile load) while keeping
 * `RobustResourceInit` satisfied, avoiding CPU `MTLTexture.replaceRegion` stalls.
 */
export enum RenderTargetLoadAction {
  /** Preserve existing attachment contents when beginning the render pass. */
  Load = 0,
  /** Clear attachment contents so TBDR GPUs skip loading stale memory into tile cache. */
  Clear = 1
}
