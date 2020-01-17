import { GLRenderHardware } from "./GLRenderHardware";
import { AssetObject } from "@alipay/o3-core";

/**
 * GL 资源对象，通过 GLAssetsCache 管理
 * */
export abstract class GLAsset {
  private readonly _rhi: GLRenderHardware;

  /** @member {AssetObject} -  引擎 js 部分的资源对象 */
  public asset: AssetObject;
  public activeFrame: number;
  public cacheID: number;

  /**
   * @param {GLRenderHardware} rhi - GPU 硬件抽象层的 WebGL 1.0
   * @param {AssetObject} asset - 引擎 js 部分的资源对象
   * */
  protected constructor(rhi: GLRenderHardware, asset: AssetObject) {
    this._rhi = rhi;
    this.asset = asset;
  }

  get rhi() {
    return this._rhi;
  }

  /**
   * 释放 GL 资源
   * @param {boolean} force - 强制释放
   */
  abstract finalize(force?: boolean);
}
