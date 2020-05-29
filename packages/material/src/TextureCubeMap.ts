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
  public _isReadable: boolean;
  public _images: Array<any>;
  private _mipMapLevel: number;
  public needUpdateCubeTextureFace: Array<boolean>;

  /**
   * CubeMap 贴图数据对象
   * @param {String} name 名称
   * @param {Array} images 纹理数据
   * @param {Object} config 可选配置，包含以下参数
   * @param {Number} [config.magFilter=TextureFilter.LINEAR] 放大时的筛选器
   * @param {Number} [config.minFilter=TextureFilter.LINEAR_MIPMAP_LINEAR] 缩小时的筛选器
   * @param {Number} [config.wrapS=TextureWrapMode.CLAMP_TO_EDGE] S方向纹理包裹选项
   * @param {Number} [config.wrapT=TextureWrapMode.CLAMP_TO_EDGE] T方向纹理包裹选项
   * @param isReadable - 是否可读
   */
  constructor(name: string, images?: Array<any>, config?: TextureConfig, isReadable: boolean = false) {
    super(name, config);

    this._isReadable = isReadable;
    this.setWrapMode(TextureWrapMode.CLAMP_TO_EDGE, TextureWrapMode.CLAMP_TO_EDGE);

    this.needUpdateCubeTextureFace = [];

    /**
     * CubeMap 的数据, 顺序为[px, nx, py, ny, pz, nz]
     * @member {Array}
     */
    if (images) {
      this.images = images;
    }
  }

  get images(): Array<any> {
    return this._images;
  }

  set images(v: Array<any>) {
    this._images = v;
    this.updateTexture();
    this.configMipmap();
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
    this.needUpdateWholeTexture = true;
    this.needUpdateFilers = true;
  }

  /**
   * 更新CubeMap中一面的数据
   * @param {Number} index 更新内容的索引
   * @param {HTMLImageElement|HTMLVideoElement|HTMLCanvasElement} image 更新的内容
   */
  updateImage(index: number, image) {
    if (this._images[0]) {
      this._images[0][index] = image;
      // this._needUpdateTexture[index] = true;
    }
    this.needUpdateCubeTextureFace[index] = true;
  }

  /**
   * 根据图像大小决定是否能够使用Mipmap
   * @private
   */
  configMipmap() {
    // manual set MipMap
    if (this.images[1]) {
      this._mipMapLevel = Math.log2(this.images[0][0].width);
    } else {
      if (isPowerOf2(this._images[0][0].width) && isPowerOf2(this._images[0][0].height)) {
        if (
          this.filterMin === TextureFilter.NEAREST_MIPMAP_NEAREST ||
          this.filterMin === TextureFilter.LINEAR_MIPMAP_NEAREST ||
          this.filterMin === TextureFilter.NEAREST_MIPMAP_LINEAR ||
          this.filterMin === TextureFilter.LINEAR_MIPMAP_LINEAR
        ) {
          this.canMipmap = true;
          this._mipMapLevel = Math.log2(this.images[0][0].width);
        } else {
          this.canMipmap = false;
          this._mipMapLevel = 0;
        }
      } else {
        this.canMipmap = false;
        this._mipMapLevel = 0;
        this.setFilter(TextureFilter.NEAREST, TextureFilter.NEAREST);
        this.setWrapMode(TextureWrapMode.CLAMP_TO_EDGE, TextureWrapMode.CLAMP_TO_EDGE);
      }
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
