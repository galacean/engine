import { WebGLRenderer } from "./WebGLRenderer";
import { AssetObject } from "@oasis-engine/core";

/**
 * GL 资源对象，通过 GLAssetsCache 管理
 * */
export abstract class GLAsset {
  private readonly _rhi: WebGLRenderer;

  /** @member {AssetObject} -  引擎 js 部分的资源对象 */
  public asset: AssetObject;
  public activeFrame: number;
  public cacheID: number;

  /**
   * @param {WebGLRenderer} rhi - GPU 硬件抽象层的 WebGL
   * @param {AssetObject} asset - 引擎 js 部分的资源对象
   * */
  protected constructor(rhi: WebGLRenderer, asset: AssetObject) {
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
