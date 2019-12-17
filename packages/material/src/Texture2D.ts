import { Texture } from "./Texture";
import { TextureFilter, TextureWrapMode } from "@alipay/o3-base";
import { TextureConfig, React } from "./type";

function isPowerOf2(v): boolean {
  return (v & (v - 1)) === 0;
}

/**
 * 2D 贴图数据对象
 */
export class Texture2D extends Texture {
  public updateSubRects: Array<React>;
  public updateSubImageData: Array<any>;
  private _image: any;

  public _context: any;

  /**
   * 2D 贴图数据对象
   * @param {String} name 名称
   * @param {HTMLImageElement|ImageData|HTMLCanvasElement|ImageBitmap|ArrayBufferView|HTMLVideoElement} image 纹理内容
   * @param {Object} config 可选配置，包含以下参数
   * @param {Number} [config.magFilter=TextureFilter.LINEAR] 放大时的筛选器
   * @param {Number} [config.minFilter=TextureFilter.LINEAR_MIPMAP_LINEAR] 缩小时的筛选器
   * @param {Number} [config.wrapS=TextureWrapMode.REPEAT] S方向纹理包裹选项
   * @param {Number} [config.wrapT=TextureWrapMode.REPEAT] T方向纹理包裹选项
   */
  constructor(name: string, image?, config?: TextureConfig) {
    super(name, config);

    if (image) {
      /**
       * Image 数据对象
       * @member {HTMLImageElement|ImageData|HTMLCanvasElement|ImageBitmap|ArrayBufferView|HTMLVideoElement}
       */
      this.image = image;
    }

    this.updateSubRects = [];
    this.updateSubImageData = [];
  }

  get image() {
    return this._image;
  }

  set image(img) {
    this._image = img;
    this.updateTexture();
    this.configMipmap();
  }

  /**
   * @param {Object} texSubRect 需要刷新的贴图子区域
   * @param {ImageData} texSubImageData 需要刷新的贴图子区域数据
   */
  updateSubTexture(texSubRect: React, texSubImageData?) {
    if (this.needUpdateWholeTexture) {
      return;
    }

    if (
      texSubRect &&
      texSubRect.x >= 0 &&
      texSubRect.y >= 0 &&
      texSubRect.x + texSubRect.width <= this._image.width &&
      texSubRect.y + texSubRect.height <= this._image.height
    ) {
      this.updateSubRects.push(texSubRect);
      this.updateSubImageData.push(texSubImageData);
    }
  }

  /**
   * 根据图像大小决定是否能够使用Mipmap
   * @private
   */
  configMipmap() {
    if (isPowerOf2(this._image.width) && isPowerOf2(this._image.height)) {
      this.canMipmap =
        this.filterMin === TextureFilter.NEAREST_MIPMAP_NEAREST ||
        this.filterMin === TextureFilter.LINEAR_MIPMAP_NEAREST ||
        this.filterMin === TextureFilter.NEAREST_MIPMAP_LINEAR ||
        this.filterMin === TextureFilter.LINEAR_MIPMAP_LINEAR;
    } else {
      this.canMipmap = false;
    }

    if (!this.canMipmap) {
      this.filterMin = this.filterMin === TextureFilter.NEAREST ? TextureFilter.NEAREST : TextureFilter.LINEAR;
      this.filterMag = this.filterMag === TextureFilter.NEAREST ? TextureFilter.NEAREST : TextureFilter.LINEAR;
      this.wrapS = TextureWrapMode.CLAMP_TO_EDGE;
      this.wrapT = TextureWrapMode.CLAMP_TO_EDGE;
    }
  }

  /**
   * 刷新整个纹理
   */
  updateTexture() {
    this.needUpdateWholeTexture = true;
    this.needUpdateFilers = true;
    this.updateSubRects = [];
    this.updateSubImageData = [];
  }

  /**
   * 取出纹理指定范围内的ImageData, 目前只有image类型是HTMLCanvasElement 2d 时支持取出。
   * @param {Number} x - x offset
   * @param {Number} y - y offset
   * @param {Number} width
   * @param {Number} height
   */
  getImageData(x: number, y: number, width: number, height: number) {
    if (!this._context && this._image.getContext) {
      this._context = this._image.getContext("2d");
    }

    if (this._context) {
      return this._context.getImageData(x, y, width, height);
    }
  }

  /**
   * 重置共享状态，以防清除GL资源后重建时状态错误
   * @private
   */
  resetState() {
    if (this.image) this.image = this.image;
    super.resetState();
  }
}
