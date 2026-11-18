import { WebGLGraphicDevice } from "./WebGLGraphicDevice";
import { GLCapabilityType } from "@galacean/engine-core";

/**
 * GLContext extension.
 */
export class GLExtensions {
  private rhi: WebGLGraphicDevice;
  private _requireResult;

  constructor(rhi: WebGLGraphicDevice) {
    this.rhi = rhi;
    this._requireResult = {};
  }

  /**
   * Require an extension.
   */
  requireExtension(ext: GLCapabilityType) {
    if (this._requireResult[ext] !== undefined) {
      return this._requireResult[ext];
    }

    this._requireResult[ext] = this.rhi.gl.getExtension(ext);
    return this._requireResult[ext];
  }
}
