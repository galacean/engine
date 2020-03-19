import { TextureFilter, TextureWrapMode } from "@alipay/o3-base";
import { AssetObject } from "@alipay/o3-core";
import { Texture2D } from "./Texture2D";
import { TextureCubeMap } from "./TextureCubeMap";
import { RenderTargetConfig } from "./type";

/**
 * 渲染目标，3D场景中的物体可以选择直接绘制到屏幕上，也可以选择渲染到一个 RenderTarget 上。
 * config.isCube= true时  - 渲染到 RenderTarget 上的内容可以作为纹理（Texture2D）供其他渲染环节使用。
 * config.isCube= false时 - 渲染到 RenderTarget 上的内容可以作为纹理（TextureCubeMap）供其他渲染环节使用。
 * @class
 */
export class RenderTarget extends AssetObject {
  public width: number;
  public height: number;
  public clearColor: Array<number>;

  public cubeTexture: TextureCubeMap;
  public texture: Texture2D;
  public depthTexture: Texture2D;

  /** WebGL2 时，可以开启硬件层的 MSAA */
  private _samples: number;

  get samples() {
    return this._samples;
  }

  set samples(v) {
    this._samples = v;
    this.needRecreate = true;
  }

  public get isMulti(): boolean {
    return this.config.isMulti;
  }

  protected textureConfig = {
    magFilter: TextureFilter.LINEAR,
    minFilter: TextureFilter.LINEAR,
    wrapS: TextureWrapMode.CLAMP_TO_EDGE,
    wrapT: TextureWrapMode.CLAMP_TO_EDGE
  };

  /**
   * 纹理对象基类
   * @param {String} name 名称
   * @param {Object} config 可选配置，包含以下参数
   * @param {Number} [config.width=1024] 宽
   * @param {Number} [config.height=1024] 高
   * @param {Number} [config.enableDepthTexture=false] 是否开启深度纹理
   * @param {Number} [config.clearColor=[0, 0, 0, 0]] 清空后的填充色
   * @param {Number} [config.isCube=false] 是否渲染到 cubeMap
   * @param {Number} [config.samples=1] MSAA 采样数,只有 WebGL2 时才会生效
   *
   */
  constructor(name: string, protected config: RenderTargetConfig = {}) {
    super(name);

    /**
     * 宽度
     * @member {Number}
     */
    this.width = config.width || 1024;

    /**
     * 高度
     * @member {Number}
     */
    this.height = config.height || 1024;

    /**
     * 清空后的填充色
     * @member {color}
     */
    this.clearColor = config.clearColor || [0, 0, 0, 0];

    /** WebGL2 时，可以开启硬件层的 MSAA */
    this._samples = config.samples || 1;

    !config.isMulti && this.initTexture();
  }

  private initTexture() {
    const config = this.config;
    // 选择渲染到2D纹理还是立方体纹理
    if (config.isCube) {
      this.cubeTexture = new TextureCubeMap(name + "_render_texture", null, this.textureConfig);
    } else {
      this.texture = new Texture2D(name + "_render_texture", null, this.textureConfig);

      if (config.enableDepthTexture) {
        /**
         * RenderTarget 渲染后的内容对应的深度纹理对象
         * 只有在 config.enableDepthTexture = true 且 config.isCube != true 时生效
         */
        this.depthTexture = new Texture2D(name + "_depth_texture", null, this.textureConfig);
      }
    }

    /** WebGL2 时，可以开启硬件层的 MSAA */
    this._samples = config.samples || 1;
  }
}
