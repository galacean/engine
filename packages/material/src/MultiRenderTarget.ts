import { Texture2D } from "./Texture2D";
import { MultiRenderTargetConfig } from "./type";
import { RenderTarget } from "./RenderTarget";

/**
 * 多渲染目标，可以渲染到多个 RenderTarget。MRT 目前不支持 MSAA 和 isCube 参数
 * @class
 */
export class MultiRenderTarget extends RenderTarget {
  private _textures: Texture2D[] = [];

  /**
   * 纹理对象基类
   * @param {String} name 名称
   * @param {Object} config 可选配置，包含以下参数
   * @param {Number} [config.width=1024] 宽
   * @param {Number} [config.height=1024] 高
   * @param {Number} [config.clearColor=[0, 0, 0, 0]] 清空后的填充色
   */
  constructor(name: string, config: MultiRenderTargetConfig = {}) {
    super(name, { ...config, isMulti: true });

    if (config.enableDepthTexture) {
      this.depthTexture = new Texture2D("depth_texture", null, this.textureConfig);
    }
  }

  public get textures(): Texture2D[] {
    return this._textures;
  }

  public addTexColor(texture: Texture2D): void {
    this._textures.push(texture);
  }
}
