import { TextureFilter, TextureWrapMode } from "@alipay/o3-base";
import { AssetObject } from "@alipay/o3-core";
import { TextureConfig } from "./type";

/**
 * 贴图对象的基类
 * @class
 */
export class Texture extends AssetObject {
  public needUpdateFilers: boolean;
  public needUpdateWholeTexture: boolean;
  public canMipmap: boolean;
  public isCompressed: boolean = false;

  public wrapS: TextureWrapMode;
  public wrapT: TextureWrapMode;
  public filterMag: TextureFilter;
  public filterMin: TextureFilter;
  private _flipY: boolean = false;
  private _premultiplyAlpha: boolean = false;

  public config: TextureConfig;

  /**
   * 纹理对象基类
   * @param {String} name 名称
   * @param {Object} config 可选配置，包含以下参数
   * @param {Number} [config.magFilter=TextureFilter.LINEAR] 放大时的筛选器
   * @param {Number} [config.minFilter=TextureFilter.LINEAR_MIPMAP_LINEAR] 缩小时的筛选器
   * @param {Number} [config.wrapS=TextureWrapMode.REPEAT] S方向纹理包裹选项
   * @param {Number} [config.wrapT=TextureWrapMode.REPEAT] T方向纹理包裹选项
   * @param {boolean} [config.flipY=false] 是否翻转图片上下
   * @param {boolean} [config.premultiplyAlpha=false] 颜色通道是否预乘 alpha
   */
  constructor(name: string, config: TextureConfig = {}) {
    super(name);
    this.config = config;

    config = {
      magFilter: TextureFilter.LINEAR,
      minFilter: TextureFilter.LINEAR_MIPMAP_LINEAR,
      wrapS: TextureWrapMode.REPEAT,
      wrapT: TextureWrapMode.REPEAT,
      flipY: false,
      premultiplyAlpha: false,
      ...config
    };
    this.flipY = config.flipY;
    this.premultiplyAlpha = config.premultiplyAlpha;
    this.setFilter(config.magFilter, config.minFilter);
    this.setWrapMode(config.wrapS, config.wrapT);
  }

  /** 是否上下翻转图片 */
  get flipY() {
    return this._flipY;
  }

  set flipY(value: boolean) {
    if (value !== this._flipY) {
      this.needUpdateWholeTexture = true;
    }
    this._flipY = value;
  }

  /** 颜色通道是否预乘 alpha */
  get premultiplyAlpha() {
    return this._premultiplyAlpha;
  }

  set premultiplyAlpha(value: boolean) {
    if (value !== this._premultiplyAlpha) {
      this.needUpdateWholeTexture = true;
    }
    this._premultiplyAlpha = value;
  }

  /**
   * 设置贴图采样时的 Filter
   * @param {GLenum} magFilter 放大筛选器
   * @param {GLenum} minFilter 缩小筛选器
   */
  setFilter(magFilter: TextureFilter, minFilter: TextureFilter): this {
    this.needUpdateFilers = this.needUpdateFilers || this.filterMag !== magFilter || this.filterMin !== minFilter;
    this.filterMag = magFilter;
    this.filterMin = minFilter;
    return this;
  }

  /**
   * 设置贴图坐标的Wrap Mode
   * @param {GLenum} wrapS 贴图坐标在 S 方向的 Wrap 模式
   * @param {GLenum} wrapT 贴图坐标在 T 方向的 Wrap 模式
   */
  setWrapMode(wrapS: TextureWrapMode, wrapT: TextureWrapMode): this {
    this.needUpdateFilers = this.needUpdateFilers || this.wrapS !== wrapS || this.wrapT !== wrapT;
    this.wrapS = wrapS;
    this.wrapT = wrapT;
    return this;
  }

  /**
   * 重置共享状态，以防清除GL资源后重建时状态错误
   * @private
   */
  resetState() {
    this.needUpdateFilers = true;
  }
}
