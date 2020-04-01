import { GLRenderHardware } from "./GLRenderHardware";
import { GLCapabilityType } from "@alipay/o3-base";

/**
 * GLContext 扩展管理
 * @private
 */
export class GLExtensions {
  private rhi: GLRenderHardware;
  private _requireResult;

  constructor(rhi: GLRenderHardware) {
    this.rhi = rhi;
    this._requireResult = {};
  }

  /**
   * 请求扩展
   * @param {String} ext 扩展名
   * @returns {Object|null} 请求结果，返回插件对象或null
   * @private
   */
  requireExtension(ext: GLCapabilityType) {
    if (this._requireResult[ext] !== undefined) {
      return this._requireResult[ext];
    }

    this._requireResult[ext] = this.rhi.gl.getExtension(ext);
    return this._requireResult[ext];
  }
}
