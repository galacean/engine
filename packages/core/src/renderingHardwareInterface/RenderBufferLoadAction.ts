/**
 * Action to take on a render buffer's existing contents when activating a render target.
 * @remarks
 * Mirrors WebGPU's `GPULoadOp` (`"load" | "clear"`). On WebGL2 (especially iOS WebKit / ANGLE-Metal),
 * full-target `gl.clear()` maps to hardware `MTLLoadActionClear` (zero DRAM tile load) while keeping
 * `RobustResourceInit` satisfied, avoiding the CPU `MTLTexture.replaceRegion` stall triggered by
 * `gl.invalidateFramebuffer` + `gl.drawArrays`.
 * @internal
 */
export enum RenderBufferLoadAction {
  /** Preserve existing buffer contents when binding the render target. */
  Load = 0,
  /** Clear buffer contents so TBDR GPUs skip loading stale memory into tile cache. */
  Clear = 1
}
