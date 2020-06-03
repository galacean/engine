import { Texture } from "./Texture";
import {
  TextureFormat,
  TextureCubeFace,
  TextureFilter,
  TextureWrapMode,
  GLCapabilityType,
  Logger
} from "@alipay/o3-base";
import { TextureFormatDetail, TextureConfig } from "./type";

/**
 * 立方体纹理
 */
export class TextureCubeMap extends Texture {
  private _format: TextureFormat;
  private _formatDetail: TextureFormatDetail;

  /**
   * 纹理的格式。
   */
  get format(): TextureFormat {
    return this._format;
  }

  /**
   * 创建立方体纹理。
   * @param rhi - GPU 硬件抽象层
   * @param size - 尺寸
   * @param format - 格式
   * @param mipmap - 是否使用分级纹理
   */
  constructorNew(rhi, size: number, format: TextureFormat = TextureFormat.R8G8B8A8, mipmap: boolean = false) {
    if (format === TextureFormat.R32G32B32A32 && !rhi.canIUse(GLCapabilityType.textureFloat)) {
      Logger.error("当前环境不支持浮点纹理,请先检测能力再使用");
      return;
    }
    if (mipmap && !Texture.isPowerOf2(size)) {
      Logger.warn("非二次幂纹理不支持开启 mipmap,已自动降级为非mipmap");
      mipmap = false;
    }

    const gl: WebGLRenderingContext & WebGL2RenderingContext = rhi.gl;
    const isWebGL2: boolean = rhi.isWebGL2;
    const formatDetail = this.getFormatDetail(format, gl, isWebGL2);
    const { internalFormat, baseFormat, dataType, isCompressed } = formatDetail;
    const glTexture = gl.createTexture();

    this._rhi = rhi;
    this._glTexture = glTexture;
    this._target = gl.TEXTURE_CUBE_MAP;
    this._width = size;
    this._height = size;
    this._mipmap = mipmap;
    this._format = format;
    this._formatDetail = formatDetail;

    // 预开辟 mipmap 显存
    if (mipmap) {
      this.bind();
      if (isWebGL2) {
        gl.texStorage2D(this._target, this.mipmapCount, internalFormat, size, size);
      } else {
        for (let i = 0; i < this.mipmapCount; i++) {
          for (let faceIndex = 0; faceIndex < 6; faceIndex++) {
            gl.texImage2D(
              gl.TEXTURE_CUBE_MAP_POSITIVE_X + faceIndex,
              i,
              internalFormat,
              size,
              size,
              0,
              baseFormat,
              dataType,
              null
            );
          }
        }
      }
      this.unbind();
    }
  }

  /**
   * 通过指定立方体面、像素缓冲数据、指定区域和纹理层级设置像素，同样适用于压缩格式。
   * @param face - 立方体面
   * @param colorBuffer - 颜色缓冲
   * @param miplevel - 分级纹理层级
   * @param x - 区域起始X坐标
   * @param y - 区域起始Y坐标
   * @param width - 区域宽
   * @param height - 区域高
   */
  setPixelBuffer(
    face: TextureCubeFace,
    colorBuffer: ArrayBufferView,
    miplevel: number = 0,
    x?: number,
    y?: number,
    width?: number,
    height?: number
  ): void {
    const gl: WebGLRenderingContext & WebGL2RenderingContext = this._rhi.gl;
    const { internalFormat, baseFormat, dataType, isCompressed } = this._formatDetail;

    this.bind();
    gl.texSubImage2D(
      gl.TEXTURE_CUBE_MAP_POSITIVE_X + face,
      miplevel,
      x || 0,
      y || 0,
      width || this._width,
      height || this._height,
      baseFormat,
      dataType,
      colorBuffer
    );
    this.unbind();
  }

  /**
   * 通过指定立方体面、图源、指定区域和纹理层级设置像素。
   * @param face - 立方体面
   * @param imageSource - 纹理源
   * @param flipY - 是否翻转Y轴
   * @param premultipltAlpha - 是否预乘透明通道
   * @param miplevel - 分级纹理层级
   * @param x - 区域起始X坐标
   * @param y - 区域起始Y坐标
   */
  setImageSource(
    face: TextureCubeFace,
    imageSource: TexImageSource,
    flipY: boolean = false,
    premultiplyAlpha: boolean = false,
    miplevel: number = 0,
    x?: number,
    y?: number
  ): void {
    const gl: WebGLRenderingContext & WebGL2RenderingContext = this._rhi.gl;
    const { internalFormat, baseFormat, dataType, isCompressed } = this._formatDetail;

    this.bind();
    gl.texSubImage2D(
      gl.TEXTURE_CUBE_MAP_POSITIVE_X + face,
      miplevel,
      x || 0,
      y || 0,
      baseFormat,
      dataType,
      imageSource
    );
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, +flipY);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, +premultiplyAlpha);
    this.unbind();
  }

  /** ----------------- @deprecated----------------- */
  private _images: Array<any>;
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
   */
  constructor(name: string, images?: Array<any>, config?: TextureConfig) {
    super(name, config);

    // todo: delete
    if (arguments[0] instanceof Object) {
      this.constructorNew.apply(this, arguments);
      return;
    }

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
      if (Texture.isPowerOf2(this._images[0][0].width) && Texture.isPowerOf2(this._images[0][0].height)) {
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
