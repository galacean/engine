import { Texture } from "./Texture";
import { TextureFilter, TextureWrapMode } from "@alipay/o3-base";
import { TextureConfig } from "./type";

function isPowerOf2(v): boolean {
  return (v & (v - 1)) === 0;
}

/**
 * CubeMap 贴图数据对象
 */
export class TextureCubeMap extends Texture {
  private _images: Array<any>;

  private _mipMapLevel: number;

  private _manualMipMap: boolean;
  protected _needUpdateFilers: boolean;
  protected _canMipmap: boolean;
  protected _needUpdateTexture: Array<boolean>;

  public updateWholeTexture: boolean;

  public isComplete: boolean = false;

  /**
   * CubeMap 贴图数据对象
   * @param {String} name 名称
   * @param {Array} images 纹理数据
   * @param {Object} config 可选配置，包含以下参数
   * @param {Number} [config.magFilter=TextureFilter.LINEAR] 放大时的筛选器
   * @param {Number} [config.minFilter=TextureFilter.LINEAR_MIPMAP_LINEAR] 缩小时的筛选器
   * @param {Number} [config.wrapS=TextureWrapMode.CLAMP_TO_EDGE] S方向纹理包裹选项
   * @param {Number} [config.wrapT=TextureWrapMode.CLAMP_TO_EDGE] T方向纹理包裹选项
   */
  constructor(name: string, images: Array<any>, config: TextureConfig) {
    super(name, config);

    this.setWrapMode(TextureWrapMode.CLAMP_TO_EDGE, TextureWrapMode.CLAMP_TO_EDGE);

    this._needUpdateTexture = [];
    /**
     * CubeMap 的数据, 顺序为[px, nx, py, ny, pz, nz]
     * @member {Array}
     */
    this.images = images;
  }

  get images(): Array<any> {
    return this._images;
  }

  set images(v: Array<any>) {
    if (v && v.length) {
      this._images = v;
      this.updateTexture();
      this.configMipmap();
      this.isComplete =
        this._images.length &&
        this._images[0].length === 6 &&
        this._images[0].reduce((sum, item) => (item ? sum + 1 : sum), 0) === 6;
    }
  }

  /**
   * MipMap层级，和具体生成和配置的层级有关
   * @readonly
   */
  get mipMapLevel(): number {
    return this._mipMapLevel;
  }

  /**
   * 刷新所有纹理
   */
  updateTexture() {
    this.updateWholeTexture = true;
    this._needUpdateFilers = true;
  }

  /**
   * 更新CubeMap中一面的数据
   * @param {Number} index 更新内容的索引
   * @param {HTMLImageElement|HTMLVideoElement|HTMLCanvasElement} image 更新的内容
   */
  updateImage(index: number, image) {
    this._images[index] = image;
    this._needUpdateTexture[index] = true;
  }

  /**
   * 根据图像大小决定是否能够使用Mipmap
   * @private
   */
  configMipmap() {
    // manual set MipMap
    if (this.images.length && this.images[0].length && this.images[0][0]) {
      if (this.images[1]) {
        this._manualMipMap = true;
        this._mipMapLevel = Math.log2(this.images[0][0].width);
      } else {
        this._manualMipMap = false;

        if (isPowerOf2(this._images[0][0].width) && isPowerOf2(this._images[0][0].height)) {
          if (
            this._filterMin === TextureFilter.NEAREST_MIPMAP_NEAREST ||
            this._filterMin === TextureFilter.LINEAR_MIPMAP_NEAREST ||
            this._filterMin === TextureFilter.NEAREST_MIPMAP_LINEAR ||
            this._filterMin === TextureFilter.LINEAR_MIPMAP_LINEAR
          ) {
            this._canMipmap = true;
            this._mipMapLevel = Math.log2(this.images[0][0].width);
          } else {
            this._canMipmap = false;
            this._mipMapLevel = 0;
          }
        } else {
          this._canMipmap = false;
          this._mipMapLevel = 0;
          this.setFilter(TextureFilter.NEAREST, TextureFilter.NEAREST);
          this.setWrapMode(TextureWrapMode.CLAMP_TO_EDGE, TextureWrapMode.CLAMP_TO_EDGE);
        }
      }
    } else {
      this._canMipmap = false;
    }
  }

  /**
   * 重置共享状态，以防清除GL资源后重建时状态错误
   * @private
   */
  resetState() {
    if (this.images) this.images = this.images;
    super.resetState();
  }
}
