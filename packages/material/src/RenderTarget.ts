import {
  TextureCubeFace,
  RenderBufferDepthFormat,
  TextureFilter,
  TextureWrapMode,
  GLCapabilityType,
  AssetType,
  Logger
} from "@alipay/o3-base";
import { AssetObject } from "@alipay/o3-core";
import { Texture2D } from "./Texture2D";
import { TextureCubeMap } from "./TextureCubeMap";
import { RenderTargetConfig } from "./type";
import { Texture } from "./Texture";
import { RenderColorTexture } from "./RenderColorTexture";
import { RenderDepthTexture } from "./RenderDepthTexture";

/**
 * 用于离屏幕渲染的渲染目标。
 */
export class RenderTarget extends AssetObject {
  public _frameBuffer: WebGLFramebuffer;
  public _MSAAFrameBuffer: WebGLFramebuffer | null;

  private _rhi;
  private _width: number;
  private _height: number;
  private _antiAliasing: number;
  private _colorTextures: RenderColorTexture[];
  private _depthTexture: RenderDepthTexture | null;
  private _depthRenderBuffer: WebGLRenderbuffer | null;
  private _MSAAColorRenderBuffers: WebGLRenderbuffer[] = [];
  private _MSAADepthRenderBuffer: WebGLRenderbuffer | null;
  private _oriDrawBuffers: GLenum[];
  private _blitDrawBuffers: GLenum[] | null;

  /** 宽。 */
  get width(): number {
    return this._width;
  }

  /** 高。 */
  get height(): number {
    return this._height;
  }

  /**
   * 颜色纹理数量。
   */
  get colorTextureCount(): number {
    return this._colorTextures.length;
  }

  /**
   * 深度纹理。
   * @todo 以后命名调整为depthTexture
   */
  get depthTextureNew(): RenderDepthTexture | null {
    return this._depthTexture;
  }

  /**
   * 抗锯齿级别。
   * 如果设置的抗锯齿级别大于硬件支持的最大级别，将使用硬件的最大级别。
   */
  get antiAliasing(): number {
    return this._antiAliasing;
  }

  /**
   * 通过颜色纹理和深度格式创建渲染目标，使用内部深度缓冲，无法获取深度纹理。
   * @todo 删除兼容性API后直接替换构造函数
   * @param rhi - GPU 硬件抽象层 @deprecated
   * @param width - 宽
   * @param height - 高
   * @param colorTexture - 颜色纹理
   * @param depthFormat - 深度格式,默认 RenderBufferDepthFormat.Depth,自动选择精度
   * @param antiAliasing - 抗锯齿级别,默认 1
   */
  constructorNew(
    rhi,
    width: number,
    height: number,
    colorTexture: RenderColorTexture,
    depthFormat?: RenderBufferDepthFormat,
    antiAliasing?: number
  );

  /**
   * 通过颜色纹理和深度纹理创建渲染目标。不传颜色纹理时，只生成深度纹理
   * @param rhi - GPU 硬件抽象层 @deprecated
   * @param width - 宽
   * @param height - 高
   * @param colorTexture - 颜色纹理
   * @param depthTexture - 深度纹理
   * @param antiAliasing - 抗锯齿级别,默认 1
   */
  constructorNew(
    rhi,
    width: number,
    height: number,
    colorTexture: RenderColorTexture | null,
    depthTexture: RenderDepthTexture,
    antiAliasing?: number
  );

  /**
   * 通过颜色纹理数组和深度格式创建渲染目标，使用内部深度缓冲，无法获取深度纹理。
   * @param rhi - GPU 硬件抽象层 @deprecated
   * @param width - 宽
   * @param height - 高
   * @param colorTextures - 颜色纹理数组
   * @param depthFormat - 深度格式,默认 RenderBufferDepthFormat.Depth,自动选择精度
   * @param antiAliasing - 抗锯齿级别,默认 1
   */
  constructorNew(
    rhi,
    width: number,
    height: number,
    colorTextures: RenderColorTexture[],
    depthFormat?: RenderBufferDepthFormat,
    antiAliasing?: number
  );

  /**
   * 通过颜色纹理数组和深度纹理创建渲染目标。
   * @param rhi - GPU 硬件抽象层 @deprecated
   * @param width - 宽
   * @param height - 高
   * @param colorTextures - 颜色纹理数组
   * @param depthTexture - 深度纹理
   * @param antiAliasing - 抗锯齿级别,默认 1
   */
  constructorNew(
    rhi,
    width: number,
    height: number,
    colorTextures: RenderColorTexture[],
    depthTexture: RenderDepthTexture,
    antiAliasing?: number
  );

  /**
   * @internal
   */
  constructorNew(
    rhi,
    width: number,
    height: number,
    renderTexture: RenderColorTexture | Array<RenderColorTexture> | null,
    depth: RenderDepthTexture | RenderBufferDepthFormat = RenderBufferDepthFormat.Depth,
    antiAliasing: number = 1
  ) {
    /** todo
     * MRT + Cube + [,MSAA]
     * MRT + MSAA
     */
    const gl: WebGLRenderingContext & WebGL2RenderingContext = rhi.gl;

    if (!(depth instanceof RenderDepthTexture) && !Texture._supportRenderBufferDepthFormat(depth, rhi, false)) {
      throw new Error(`RenderBufferDepthFormat is not supported:${RenderBufferDepthFormat[depth]}`);
    }

    if ((renderTexture as RenderColorTexture[])?.length > 1 && !rhi.canIUse(GLCapabilityType.drawBuffers)) {
      throw new Error("MRT is not supported");
    }

    // handle this._colorTextures
    if (renderTexture) {
      this._colorTextures = renderTexture instanceof Array ? renderTexture.slice() : [renderTexture];
    } else {
      this._colorTextures = [];
    }

    if (this._colorTextures.some((v: RenderColorTexture) => v.width !== width || v.height !== height)) {
      throw new Error("RenderColorTexture's size must as same as RenderTarget");
    }

    if (depth instanceof RenderDepthTexture && (depth.width !== width || depth.height !== height)) {
      throw new Error("RenderDepthTexture's size must as same as RenderTarget");
    }

    // todo: necessary to support MRT + Cube + [,MSAA] ?
    if (this._colorTextures.length > 1 && this._colorTextures.some((v: RenderColorTexture) => v._isCube)) {
      throw new Error("MRT+Cube+[,MSAA] is not supported");
    }

    const maxAntiAliasing = rhi.capability.maxAntiAliasing;
    if (antiAliasing > maxAntiAliasing) {
      Logger.warn(`MSAA antiAliasing exceeds the limit and is automatically downgraded to:${maxAntiAliasing}`);
      antiAliasing = maxAntiAliasing;
    }

    this._rhi = rhi;
    this._width = width;
    this._height = height;
    this._frameBuffer = gl.createFramebuffer();
    this._antiAliasing = antiAliasing;

    if (depth instanceof RenderDepthTexture) {
      this._depthTexture = depth;
    }

    // 绑定主 FBO
    this._bindMainFBO(depth);

    // 绑定 MSAA FBO
    if (antiAliasing > 1) {
      this._MSAAFrameBuffer = gl.createFramebuffer();
      this._bindMSAAFBO(depth);
    }

    //todo: delete
    this.type = AssetType.Scene;
  }

  /**
   * 通过索引获取颜色纹理。
   * @param index
   */
  public getColorTexture(index: number = 0): RenderColorTexture | null {
    return this._colorTextures[index];
  }

  /**
   * 销毁。
   */
  public destroy(): void {
    const gl: WebGLRenderingContext & WebGL2RenderingContext = this._rhi.gl;

    gl.deleteFramebuffer(this._frameBuffer);
    gl.deleteRenderbuffer(this._depthRenderBuffer);
    this._MSAAFrameBuffer && gl.deleteFramebuffer(this._MSAAFrameBuffer);
    gl.deleteRenderbuffer(this._MSAADepthRenderBuffer);

    for (let i = 0; i < this._colorTextures.length; i++) {
      this._colorTextures[i].destroy();
    }

    for (let i = 0; i < this._MSAAColorRenderBuffers.length; i++) {
      gl.deleteRenderbuffer(this._MSAAColorRenderBuffers[i]);
    }

    if (this._depthTexture) {
      this._depthTexture.destroy();
    }

    this._frameBuffer = null;
    this._colorTextures.length = 0;
    this._depthTexture = null;
    this._depthRenderBuffer = null;
    this._MSAAFrameBuffer = null;
    this._MSAAColorRenderBuffers.length = 0;
    this._MSAADepthRenderBuffer = null;
  }

  /**
   * 激活 RenderTarget 对象
   * 如果开启 MSAA,则激活 MSAA FBO,后续进行 this._blitRenderTarget() 进行交换 FBO
   * 如果未开启 MSAA,则激活主 FBO
   */
  public _activeRenderTarget(): void {
    const gl: WebGLRenderingContext & WebGL2RenderingContext = this._rhi.gl;

    if (this._MSAAFrameBuffer) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, this._MSAAFrameBuffer);
    } else {
      gl.bindFramebuffer(gl.FRAMEBUFFER, this._frameBuffer);
    }
  }

  /**
   * 设置渲染到立方体纹理的哪个面
   * @param faceIndex - 立方体纹理面
   */
  public _setRenderTargetFace(faceIndex: TextureCubeFace): void {
    const gl: WebGLRenderingContext & WebGL2RenderingContext = this._rhi.gl;
    const colorTexture = this._colorTextures[0];
    const depthTexture = this._depthTexture;

    gl.bindFramebuffer(gl.FRAMEBUFFER, this._frameBuffer);

    // 绑定颜色纹理
    if (colorTexture?._isCube) {
      gl.framebufferTexture2D(
        gl.FRAMEBUFFER,
        gl.COLOR_ATTACHMENT0,
        gl.TEXTURE_CUBE_MAP_POSITIVE_X + faceIndex,
        colorTexture._glTexture,
        0
      );
    }

    // 绑定深度纹理
    if (depthTexture?._isCube) {
      gl.framebufferTexture2D(
        gl.FRAMEBUFFER,
        depthTexture._formatDetail.attachment,
        gl.TEXTURE_CUBE_MAP_POSITIVE_X + faceIndex,
        depthTexture._glTexture,
        0
      );
    }

    // 还原当前激活的 FBO
    this._activeRenderTarget();
  }

  /**
   * Blit FBO.
   */
  public _blitRenderTarget(): void {
    const gl: WebGLRenderingContext & WebGL2RenderingContext = this._rhi.gl;
    const mask = gl.COLOR_BUFFER_BIT | (this._depthTexture ? gl.DEPTH_BUFFER_BIT : 0);
    const colorTextureLength = this._colorTextures.length;

    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, this._MSAAFrameBuffer);
    gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, this._frameBuffer);

    for (let textureIndex = 0; textureIndex < colorTextureLength; textureIndex++) {
      const attachment = gl.COLOR_ATTACHMENT0 + textureIndex;

      this._blitDrawBuffers[textureIndex] = attachment;

      gl.readBuffer(attachment);
      gl.drawBuffers(this._blitDrawBuffers);
      gl.blitFramebuffer(0, 0, this._width, this._height, 0, 0, this._width, this._height, mask, gl.NEAREST);

      this._blitDrawBuffers[textureIndex] = gl.NONE;
    }

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  /**
   * 绑定主 FBO
   */
  private _bindMainFBO(renderDepth: RenderDepthTexture | RenderBufferDepthFormat): void {
    const gl: WebGLRenderingContext & WebGL2RenderingContext = this._rhi.gl;
    const isWebGL2: boolean = this._rhi.isWebGL2;
    const colorTextureLength = this._colorTextures.length;
    const drawBuffers = new Array(colorTextureLength);

    gl.bindFramebuffer(gl.FRAMEBUFFER, this._frameBuffer);

    /** color render buffer */
    for (let i = 0; i < colorTextureLength; i++) {
      const colorTexture = this._colorTextures[i];
      const attachment = gl.COLOR_ATTACHMENT0 + i;

      drawBuffers[i] = attachment;

      // 立方体纹理请调用 _setRenderTargetFace()
      if (!colorTexture._isCube) {
        gl.framebufferTexture2D(gl.FRAMEBUFFER, attachment, gl.TEXTURE_2D, colorTexture._glTexture, 0);
      }
    }

    if (colorTextureLength > 1) {
      gl.drawBuffers(drawBuffers);
    }
    this._oriDrawBuffers = drawBuffers;

    /** depth render buffer */
    if (renderDepth instanceof RenderDepthTexture) {
      // 立方体纹理请调用 _setRenderTargetFace()
      if (!renderDepth._isCube) {
        gl.framebufferTexture2D(
          gl.FRAMEBUFFER,
          renderDepth._formatDetail.attachment,
          gl.TEXTURE_2D,
          renderDepth._glTexture,
          0
        );
      }
    } else if (this._antiAliasing <= 1) {
      const { internalFormat, attachment } = Texture._getRenderBufferDepthFormatDetail(renderDepth, gl, isWebGL2);
      const depthRenderBuffer = gl.createRenderbuffer();

      this._depthRenderBuffer = depthRenderBuffer;

      gl.bindRenderbuffer(gl.RENDERBUFFER, depthRenderBuffer);
      gl.renderbufferStorage(gl.RENDERBUFFER, internalFormat, this._width, this._height);
      gl.framebufferRenderbuffer(gl.FRAMEBUFFER, attachment, gl.RENDERBUFFER, depthRenderBuffer);
    }

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.bindRenderbuffer(gl.RENDERBUFFER, null);
  }

  /**
   * 绑定 MSAA FBO
   */
  private _bindMSAAFBO(renderDepth: RenderDepthTexture | RenderBufferDepthFormat): void {
    const gl: WebGLRenderingContext & WebGL2RenderingContext = this._rhi.gl;
    const isWebGL2: boolean = this._rhi.isWebGL2;
    const MSAADepthRenderBuffer = gl.createRenderbuffer();
    const colorTextureLength = this._colorTextures.length;

    this._blitDrawBuffers = new Array(colorTextureLength);
    this._MSAADepthRenderBuffer = MSAADepthRenderBuffer;

    gl.bindFramebuffer(gl.FRAMEBUFFER, this._MSAAFrameBuffer);

    // prepare MRT+MSAA color RBOs
    for (let i = 0; i < colorTextureLength; i++) {
      const MSAAColorRenderBuffer = gl.createRenderbuffer();

      this._MSAAColorRenderBuffers[i] = MSAAColorRenderBuffer;
      this._blitDrawBuffers[i] = gl.NONE;

      gl.bindRenderbuffer(gl.RENDERBUFFER, MSAAColorRenderBuffer);
      gl.renderbufferStorageMultisample(
        gl.RENDERBUFFER,
        this._antiAliasing,
        this._colorTextures[i]._formatDetail.internalFormat,
        this._width,
        this._height
      );
      gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0 + i, gl.RENDERBUFFER, MSAAColorRenderBuffer);
    }
    gl.drawBuffers(this._oriDrawBuffers);

    // prepare MSAA depth RBO
    const { internalFormat, attachment } =
      renderDepth instanceof RenderDepthTexture
        ? renderDepth._formatDetail
        : Texture._getRenderBufferDepthFormatDetail(renderDepth, gl, isWebGL2);

    gl.bindRenderbuffer(gl.RENDERBUFFER, MSAADepthRenderBuffer);
    gl.renderbufferStorageMultisample(gl.RENDERBUFFER, this._antiAliasing, internalFormat, this._width, this._height);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, attachment, gl.RENDERBUFFER, MSAADepthRenderBuffer);

    this._checkFrameBuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.bindRenderbuffer(gl.RENDERBUFFER, null);
  }

  /**
   * 检查 FBO
   */
  private _checkFrameBuffer(): void {
    const gl: WebGLRenderingContext & WebGL2RenderingContext = this._rhi.gl;
    const isWebGL2: boolean = this._rhi.isWebGL2;
    const e = gl.checkFramebufferStatus(gl.FRAMEBUFFER);

    switch (e) {
      case gl.FRAMEBUFFER_INCOMPLETE_ATTACHMENT:
        throw new Error(
          "The attachment types are mismatched or not all framebuffer attachment points are framebuffer attachment complete"
        );
      case gl.FRAMEBUFFER_INCOMPLETE_MISSING_ATTACHMENT:
        throw new Error("There is no attachment");
      case gl.FRAMEBUFFER_INCOMPLETE_DIMENSIONS:
        throw new Error(" Height and width of the attachment are not the same.");
      case gl.FRAMEBUFFER_UNSUPPORTED:
        throw new Error(
          "The format of the attachment is not supported or if depth and stencil attachments are not the same renderbuffer"
        );
    }

    if (isWebGL2 && e === gl.FRAMEBUFFER_INCOMPLETE_MULTISAMPLE) {
      throw new Error(
        "The values of gl.RENDERBUFFER_SAMPLES are different among attached renderbuffers, or are non-zero if the attached images are a mix of renderbuffers and textures."
      );
    }
  }

  /** -------------------@deprecated------------------------ */

  public clearColor: Array<number> = [0, 0, 0, 0];

  public cubeTexture: TextureCubeMap;
  public texture: Texture2D;
  public depthTexture: Texture2D;
  public colorBufferFloat: boolean;

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
   * @param {Number} [config.colorBufferFloat=false]  color Buffer 输出是否要 float 浮点类型
   *
   */
  constructor(name: string, protected config: RenderTargetConfig = {}) {
    super(name);

    // todo: delete
    if (arguments[0] instanceof Object) {
      this.constructorNew.apply(this, arguments);
      return;
    }
    /**
     * 宽度
     * @member {Number}
     */
    this._width = config.width || 1024;

    /**
     * 高度
     * @member {Number}
     */
    this._height = config.height || 1024;

    /**
     * 清空后的填充色
     * @member {color}
     */
    this.clearColor = config.clearColor || [0, 0, 0, 0];

    /** WebGL2 时，可以开启硬件层的 MSAA */
    this._samples = config.samples || 1;

    /** color Buffer 输出是否要 float 浮点类型 */
    this.colorBufferFloat = !!config.colorBufferFloat;

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
  }
}
