import { WebGLRenderer } from "./WebGLRenderer";
import { GLCapabilityType } from "@oasis-engine/core";

/**
 * GLContext extension.
 */
export class GLExtensions {
  private rhi: WebGLRenderer;
  private _requireResult;

  constructor(rhi: WebGLRenderer) {
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
