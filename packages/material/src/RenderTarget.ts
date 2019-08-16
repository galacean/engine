import {TextureFilter, TextureWrapMode} from '@alipay/r3-base';
import {AssetObject} from '@alipay/r3-core';
import {Texture2D} from './Texture2D';

/**
 * 渲染目标，3D场景中的物体可以选择直接绘制到屏幕上，也可以选择渲染到一个 RenderTarget 上。渲染到 RenderTarget 上的内容可以作为纹理（Texture2D）供其他渲染环节使用。
 * @class
 */
export class RenderTarget extends AssetObject {

  public width: number;
  public height: number;
  public clearColor: Array<number>;
  public texture: any;
  public depthTexture: any;

  /**
   * 纹理对象基类
   * @param {String} name 名称
   * @param {Object} config 可选配置，包含以下参数
   * @param {Number} [config.width=1024] 宽
   * @param {Number} [config.height=1024] 高
   * @param {Number} [config.enableDepthTexture=false] 是否开启深度纹理
   * @param {Number} [config.clearColor=[0, 0, 0, 0]] 清空后的填充色
   */
  constructor(name, config: { width?: number, height?: number, clearColor?, enableDepthTexture?: boolean } = {}) {

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

    const textureConfig = {
      magFilter: TextureFilter.LINEAR,
      minFilter: TextureFilter.LINEAR,
      wrapS: TextureWrapMode.CLAMP_TO_EDGE,
      wrapT: TextureWrapMode.CLAMP_TO_EDGE,
    };

    /**
     * RenderTarget 渲染后的内容对应的纹理对象
     * @member {string}
     */
    this.texture = new Texture2D(name + '_render_texture', null, textureConfig);

    if (config.enableDepthTexture) {

      /**
       * RenderTarget 渲染后的内容对应的深度纹理对象，只有在 config.enableDepthTexture = true 时生效
       * @member {string}
       */
      this.depthTexture = new Texture2D(name + '_depth_texture', null, textureConfig);

    }

  }

}
