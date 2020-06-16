import { Texture } from "./Texture";
import { TextureFormat, TextureFilter, TextureWrapMode, GLCapabilityType, AssetType, Logger } from "@alipay/o3-base";
import { mat3 } from "@alipay/o3-math";
import { Texture2DConfig, Rect } from "./type";

/**
 * 2D纹理
 */
export class Texture2D extends Texture {
  private _format: TextureFormat;

  /**
   * 纹理的格式。
   */
  get format(): TextureFormat {
    return this._format;
  }

  /**
   * 构建一个2D纹理。
   * @todo 删除兼容性API后直接替换构造函数
   * @param rhi - GPU 硬件抽象层
   * @param width - 宽
   * @param height - 高
   * @param format - 格式,默认 TextureFormat.R8G8B8A8
   * @param mipmap - 是否使用多级纹理
   */
  constructorNew(
    rhi,
    width: number,
    height: number,
    format: TextureFormat = TextureFormat.R8G8B8A8,
    mipmap: boolean = true
  ) {
    const gl: WebGLRenderingContext & WebGL2RenderingContext = rhi.gl;
    const isWebGL2: boolean = rhi.isWebGL2;

    if (format === TextureFormat.R32G32B32A32 && !rhi.canIUse(GLCapabilityType.textureFloat)) {
      Logger.error("当前环境不支持浮点纹理,请先检测能力再使用"); //CM：写英文
      return;
    }
    if (mipmap && !isWebGL2 && (!Texture._isPowerOf2(width) || !Texture._isPowerOf2(height))) {
      Logger.warn("WebGL1不支持非二次幂纹理开启 mipmap,已自动降级为非mipmap"); //CM：写英文
      mipmap = false;
    }

    const formatDetail = Texture._getFormatDetail(format, gl, isWebGL2);

    if (!formatDetail) {
      Logger.error(`很抱歉，引擎不支持此格式: ${format}`); //CM：写英文
      return;
    }

    const glTexture = gl.createTexture();

    this._glTexture = glTexture;
    this._formatDetail = formatDetail;
    this._isCube = false;
    this._rhi = rhi;
    this._target = gl.TEXTURE_2D;
    this._mipmap = mipmap;
    this._width = width;
    this._height = height;
    this._format = format;

    if (!this._formatDetail.isCompressed) {
      this._initMipmap();
    }

    //todo: delete
    this.type = AssetType.Scene;
  }

  /**
   * 通过颜色缓冲数据、指定区域和纹理层级设置像素，同样适用于压缩格式。
   * @param pixelBuffer - 颜色缓冲数据
   * @param miplevel - 纹理层级
   * @param x - 数据起始X坐标
   * @param y - 数据起始Y坐标
   * @param width - 数据宽度
   * @param height - 数据高度
   */
  public setPixelBuffer(
    colorBuffer: ArrayBufferView,
    miplevel: number = 0,
    x?: number,
    y?: number,
    width?: number,
    height?: number
  ): void {
    const gl: WebGLRenderingContext & WebGL2RenderingContext = this._rhi.gl;
    const { internalFormat, baseFormat, dataType, isCompressed } = this._formatDetail;
    const mipWidth = Math.max(1, this._width >> miplevel);
    const mipHeight = Math.max(1, this._height >> miplevel);

    x = x || 0;
    y = y || 0;
    width = width || mipWidth - x;
    height = height || mipHeight - y;

    this._bind();

    if (isCompressed) {
      gl.compressedTexImage2D(this._target, miplevel, internalFormat, width, height, 0, colorBuffer);
    } else {
      gl.texSubImage2D(this._target, miplevel, x, y, width, height, baseFormat, dataType, colorBuffer);
    }

    this._unbind();
  }

  /**
   * 通过图源、指定区域和纹理层级设置像素。
   * @param imageSource - 纹理源
   * @param miplevel - 多级纹理层级
   * @param flipY - 是否翻转Y轴
   * @param premultiplyAlpha - 是否预乘透明通道
   * @param x - 区域起始X坐标
   * @param y - 区域起始Y坐标
   */
  public setImageSource(
    imageSource: TexImageSource,
    miplevel: number = 0,
    flipY: boolean = false,
    premultiplyAlpha: boolean = false,
    x?: number,
    y?: number
  ): void {
    const gl: WebGLRenderingContext & WebGL2RenderingContext = this._rhi.gl;
    const { baseFormat, dataType } = this._formatDetail;

    this._bind();
    gl.texSubImage2D(this._target, miplevel, x || 0, y || 0, baseFormat, dataType, imageSource);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, +flipY);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, +premultiplyAlpha);
    this._unbind();
  }

  /**
   * 根据指定区域获得像素颜色缓冲
   * @param x - 区域起始X坐标
   * @param y - 区域起始Y坐标
   * @param width - 区域宽
   * @param height - 区域高
   * @param out - 颜色数据缓冲
   */
  public getPixelsBuffer(x: number, y: number, width: number, height: number, out: ArrayBufferView): void {
    if (this._formatDetail.isCompressed) {
      Logger.error("无法读取压缩纹理");
      return;
    }
    super._getPixelsBuffer(null, x, y, width, height, out);
  }

  /** ----------------- @deprecated----------------- */
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

  /**
   * 2D 贴图数据对象
   * @param {String} name 名称
   * @param {HTMLImageElement|ImageData|HTMLCanvasElement|ImageBitmap|ArrayBufferView|HTMLVideoElement} image 纹理内容
   * @param {Texture2DConfig} config 可选配置
   */
  constructor(name: string, image?, config: Texture2DConfig = {}) {
    super(name, config);

    // todo: delete
    if (arguments[0] instanceof Object) {
      this.constructorNew.apply(this, arguments);
      return;
    }

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
    this._width = config.width;
    this._height = config.height;

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
    if (this._glTexture) {
      return this._uvMatrix;
    }
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
    if (Texture._isPowerOf2(this._image.width) && Texture._isPowerOf2(this._image.height)) {
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
