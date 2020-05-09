import { Texture } from "./Texture";
import { TextureFilter, TextureWrapMode } from "@alipay/o3-base";
import { mat3 } from "@alipay/o3-math";
import { Texture2DConfig, Rect } from "./type";

function isPowerOf2(v): boolean {
  return (v & (v - 1)) === 0;
}

/**
 * 2D 贴图数据对象
 */
export class Texture2D extends Texture {
  public updateSubRects: Array<Rect>;
  public updateSubImageData: Array<any>;
  private _image: any;
  private _context: any;

  /** uv transform */
  public uOffset: number;
  public vOffset: number;
  public uScale: number;
  public vScale: number;
  public uvRotation: number; // 弧度:0～2PI
  public uvCenter: number[];

  private _uvMatrix = mat3.create();

  /** 是否为 Raw 数据源，如 ImageData、ArrayBufferView */
  public isRaw: boolean;
  public width: number;
  public height: number;

  /**
   * 2D 贴图数据对象
   * @param {String} name 名称
   * @param {HTMLImageElement|ImageData|HTMLCanvasElement|ImageBitmap|ArrayBufferView|HTMLVideoElement} image 纹理内容
   * @param {Texture2DConfig} config 可选配置
   */
  constructor(name: string, image?, config: Texture2DConfig = {}) {
    super(name, config);

    config = {
      uOffset: 0,
      vOffset: 0,
      uScale: 1,
      vScale: 1,
      uvRotation: 0,
      uvCenter: [0, 0],
      isRaw: false,
      width: null,
      height: null,
      ...config
    };

    this.uOffset = config.uOffset;
    this.vOffset = config.vOffset;
    this.uScale = config.uScale;
    this.vScale = config.vScale;
    this.uvRotation = config.uvRotation;
    this.uvCenter = config.uvCenter;
    this.isRaw = config.isRaw;
    this.width = config.width;
    this.height = config.height;

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

  /**
   * 获取纹理 RTS 变换矩阵
   * */
  public get uvMatrix() {
    return mat3.fromUvTransform(
      this._uvMatrix,
      this.uOffset,
      this.vOffset,
      this.uScale,
      this.vScale,
      this.uvRotation,
      this.uvCenter
    );
  }

  get image() {
    return this._image;
  }

  set image(img) {
    this._image = img;
    this.updateTexture();
    if (this.isRaw) {
      this.setFilter(TextureFilter.NEAREST, TextureFilter.NEAREST);
      this.setWrapMode(TextureWrapMode.CLAMP_TO_EDGE, TextureWrapMode.CLAMP_TO_EDGE);
      this.canMipmap = false;
    } else {
      this.configMipmap();
    }
  }

  /**
   * @param {Object} texSubRect 需要刷新的贴图子区域
   * @param {ImageData} texSubImageData 需要刷新的贴图子区域数据
   */
  updateSubTexture(texSubRect: Rect, texSubImageData?) {
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
