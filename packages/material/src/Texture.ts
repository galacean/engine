import {TextureFilter, TextureWrapMode} from '@alipay/o3-base';
import {AssetObject} from '@alipay/o3-core';
import {TextureConfig} from './type';

/**
 * 贴图对象的基类
 * @class
 */
export class Texture extends AssetObject {

  protected _needUpdateFilers: boolean;
  protected _wrapS: TextureWrapMode;
  protected _wrapT: TextureWrapMode;
  protected _filterMag: TextureFilter;
  protected _filterMin: TextureFilter;


  /**
   * 纹理对象基类
   * @param {String} name 名称
   * @param {Object} config 可选配置，包含以下参数
   * @param {Number} [config.magFilter=TextureFilter.LINEAR] 放大时的筛选器
   * @param {Number} [config.minFilter=TextureFilter.LINEAR_MIPMAP_LINEAR] 缩小时的筛选器
   * @param {Number} [config.wrapS=TextureWrapMode.REPEAT] S方向纹理包裹选项
   * @param {Number} [config.wrapT=TextureWrapMode.REPEAT] T方向纹理包裹选项
   */
  constructor(name: string, config: TextureConfig = {}) {

    super(name);

    this.setFilter(config.magFilter || TextureFilter.LINEAR, config.minFilter || TextureFilter.LINEAR_MIPMAP_LINEAR);
    this.setWrapMode(config.wrapS || TextureWrapMode.REPEAT, config.wrapT || TextureWrapMode.REPEAT);

  }

  /**
   * 设置贴图采样时的 Filter
   * @param {GLenum} magFilter 放大筛选器
   * @param {GLenum} minFilter 缩小筛选器
   */
  setFilter(magFilter: TextureFilter, minFilter: TextureFilter): this {

    this._needUpdateFilers = this._needUpdateFilers || (this._filterMag !== magFilter) || (this._filterMin !== minFilter);
    this._filterMag = magFilter;
    this._filterMin = minFilter;
    return this;

  }

  /**
   * 设置贴图坐标的Wrap Mode
   * @param {GLenum} wrapS 贴图坐标在 S 方向的 Wrap 模式
   * @param {GLenum} wrapT 贴图坐标在 T 方向的 Wrap 模式
   */
  setWrapMode(wrapS: TextureWrapMode, wrapT: TextureWrapMode): this {

    this._needUpdateFilers = this._needUpdateFilers || (this._wrapS !== wrapS) || (this._wrapT !== wrapT);
    this._wrapS = wrapS;
    this._wrapT = wrapT;
    return this;

  }

  /**
   * 重置共享状态，以防清除GL资源后重建时状态错误
   * @private
   */
  resetState() {

    this._needUpdateFilers = true;

  }

}
