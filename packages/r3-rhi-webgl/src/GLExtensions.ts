/**
 * GLContext 扩展管理
 * @private
 */
export class GLExtensions {

  rhi;
  private _requireResult;
  
  constructor(rhi) {

    this.rhi = rhi;
    this._requireResult = {};

  }

  /**
   * 请求扩展
   * @param {String} ext 扩展名
   * @returns {Object|null} 请求结果，返回插件对象或null
   * @private
   */
  requireExtension(ext) {

    if (this._requireResult[ext] !== undefined) {

      return this._requireResult[ext];

    }

    this._requireResult[ext] = this.rhi.gl.getExtension(ext);
    return this._requireResult[ext];

  }

}
