import { HardwareRenderer } from "../../HardwareRenderer";
import { CullMode } from "../enums/CullMode";
import { RenderState } from "./RenderState";

/**
 * Raster state.
 */
export class RasterState {
  /** specifies whether or not front- and/or back-facing polygons can be culled. */
  cullMode: CullMode = CullMode.Back;
  /** the multiplier by which an implementation-specific value is multiplied with to create a constant depth offset. */
  depthBias: number = 0;
  /** the scale factor for the variable depth offset for each polygon. */
  slopeScaledDepthBias: number = 0;

  /** @internal */
  _cullFaceEnable: boolean = true;

  /**
   * @internal
   */
  _apply(hardwareRenderer: HardwareRenderer, lastRenderState: RenderState): void {
    this._platformApply(hardwareRenderer, lastRenderState.rasterState);
  }

  private _platformApply(rhi: HardwareRenderer, lastState: RasterState): void {
    const gl = <WebGLRenderingContext>rhi.gl;
    const { cullMode, depthBias, slopeScaledDepthBias } = this;

    const cullFaceEnable = cullMode !== CullMode.Off;
    if (cullFaceEnable !== lastState._cullFaceEnable) {
      if (cullFaceEnable) {
        gl.enable(gl.CULL_FACE);
      } else {
        gl.disable(gl.CULL_FACE);
      }
      lastState._cullFaceEnable = cullFaceEnable;
    }

    // apply front face.
    if (cullFaceEnable) {
      if (cullMode !== lastState.cullMode) {
        if (cullMode == CullMode.Back) {
          gl.cullFace(gl.BACK);
        } else {
          gl.cullFace(gl.FRONT);
        }
        lastState.cullMode = cullMode;
      }
    }

    // apply polygonOffset.
    if (depthBias !== lastState.depthBias || slopeScaledDepthBias !== lastState.slopeScaledDepthBias) {
      if (depthBias !== 0 || slopeScaledDepthBias !== 0) {
        gl.enable(gl.POLYGON_OFFSET_FILL);
        gl.polygonOffset(slopeScaledDepthBias, depthBias);
      } else {
        gl.disable(gl.POLYGON_OFFSET_FILL);
      }
      lastState.depthBias = depthBias;
      lastState.slopeScaledDepthBias = slopeScaledDepthBias;
    }
  }
}
