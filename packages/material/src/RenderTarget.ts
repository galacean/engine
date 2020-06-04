import {
  TextureCubeFace,
  RenderBufferDepthFormat,
  TextureFilter,
  TextureWrapMode,
  GLCapabilityType,
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
  /**
   * 颜色纹理数量。
   */
  get colorTextureCount(): number {
    return this._colorTextures.length;
  }

  /**
   * 深度纹理。
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

  private _rhi;
  private _width: number;
  private _height: number;
  private _frameBuffer: WebGLFramebuffer;
  private _MSAAFrameBuffer: WebGLFramebuffer;
  private _antiAliasing: number;
  private _colorTextures: Array<RenderColorTexture> = [];
  private _depthTexture: RenderDepthTexture | null;

  /**
   * 通过颜色纹理和深度格式创建渲染目标，使用内部深度缓冲，无法获取深度纹理。
   * @param rhi - GPU 硬件抽象层
   * @param width - 宽
   * @param height - 高
   * @param colorTexture - 颜色纹理
   * @param depthFormat - 深度格式,默认 RenderBufferDepthFormat.Depth,自动选择精度
   * @param antiAliasing - 抗锯齿级别
   */
  constructorNew(
    rhi,
    width: number,
    height: number,
    colorTexture: RenderColorTexture,
    depthFormat: RenderBufferDepthFormat,
    antiAliasing?: number
  );

  /**
   * 通过颜色纹理和深度纹理创建渲染目标。不传颜色纹理时，只生成深度纹理
   * @param rhi - GPU 硬件抽象层
   * @param width - 宽
   * @param height - 高
   * @param colorTexture - 颜色纹理
   * @param depthTexture - 深度纹理
   * @param antiAliasing - 抗锯齿级别
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
   * @param rhi - GPU 硬件抽象层
   * @param width - 宽
   * @param height - 高
   * @param colorTextures - 颜色纹理数组
   * @param depthFormat - 深度格式
   * @param antiAliasing - 抗锯齿级别
   */
  constructorNew(
    rhi,
    width: number,
    height: number,
    colorTextures: Array<RenderColorTexture>,
    depthFormat: RenderBufferDepthFormat,
    antiAliasing?: number
  );

  /**
   * 通过颜色纹理数组和深度纹理创建渲染目标。
   * @param rhi - GPU 硬件抽象层
   * @param width - 宽
   * @param height - 高
   * @param colorTextures - 颜色纹理数组
   * @param depthTexture - 深度纹理
   * @param antiAliasing - 抗锯齿级别
   */
  constructorNew(
    rhi,
    width: number,
    height: number,
    colorTextures: Array<RenderColorTexture>,
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
    depth: RenderDepthTexture | RenderBufferDepthFormat,
    antiAliasing: number = 1
  ) {
    const maxAntiAliasing = rhi.capability.maxAntiAliasing;

    if ((renderTexture as Array<RenderColorTexture>)?.length > 1 && !rhi.canIUse(GLCapabilityType.drawBuffers)) {
      Logger.error("当前环境不支持 MRT,请先检测能力再使用");
      return;
    }
    if (antiAliasing > maxAntiAliasing) {
      Logger.warn(`antiAliasing 超出当前环境限制，已自动降级为最大值:${maxAntiAliasing}`);
      antiAliasing = maxAntiAliasing;
    }

    const gl: WebGLRenderingContext & WebGL2RenderingContext = rhi.gl;
    const isWebGL2: boolean = rhi.isWebGL2;
    const frameBuffer = gl.createFramebuffer();
    const attachments = [];
    let depthFormat: GLint;

    this._rhi = rhi;
    this._width = width;
    this._height = height;
    this._frameBuffer = frameBuffer;
    this._antiAliasing = antiAliasing;

    this._bind();

    /** color render buffer */
    this._colorTextures = [].concat.call([], renderTexture).filter((v: RenderColorTexture | null) => v);

    // todo: necessary to support MRT + Cube + [,MSAA] ?
    if (this._colorTextures.length > 1 && this._colorTextures.some((v: RenderColorTexture) => v._isCube)) {
      Logger.error("引擎暂不支持 MRT+Cube+[,MSAA]");
      return;
    }

    if (this._colorTextures.length > 1 || (this._colorTextures.length === 0 && !this._colorTextures[0]._isCube)) {
      this._colorTextures.forEach((colorTexture: RenderColorTexture, index: number) => {
        const attachment = gl.COLOR_ATTACHMENT0 + index;

        colorTexture._bind();
        gl.framebufferTexture2D(gl.FRAMEBUFFER, attachment, gl.TEXTURE_2D, colorTexture._glTexture, 0);
        colorTexture._unbind();

        attachments.push(attachment);
      });
    }
    if (this._colorTextures.length > 0) {
      gl.drawBuffers(attachments);
    }

    /** depth render buffer */
    if (depth instanceof RenderDepthTexture) {
      const { internalFormat, attachment } = depth._formatDetail;

      depthFormat = internalFormat;
      this._depthTexture = depth;

      if (!depth._isCube) {
        depth._bind();
        gl.framebufferTexture2D(gl.FRAMEBUFFER, attachment, gl.TEXTURE_2D, depth._glTexture, 0);
        depth._unbind();
      }
    } else if (antiAliasing <= 1) {
      const { internalFormat, attachment } = Texture._getFormatDetail(depth, gl, isWebGL2);
      const depthRenderBuffer = gl.createRenderbuffer();

      depthFormat = internalFormat;

      gl.bindRenderbuffer(gl.RENDERBUFFER, depthRenderBuffer);
      gl.renderbufferStorage(gl.RENDERBUFFER, internalFormat, width, height);
      gl.framebufferRenderbuffer(gl.FRAMEBUFFER, attachment, gl.RENDERBUFFER, depthRenderBuffer);
    }

    this._unbind();
    gl.bindRenderbuffer(gl.RENDERBUFFER, null);

    /** MSAA */
    antiAliasing > 1 && this._initMSAA(depthFormat);
  }

  /**
   * 通过索引获取颜色纹理。
   * @param index
   */
  public getColorTexture(index: number = 0): RenderColorTexture | null {
    return this._colorTextures[index];
  }

  /**
   * 绑定 FBO
   * @param read  - 是否设置FBO作为读对象
   * @param msaa  - 是否绑定 MSAA FBO
   */
  public _bind(read: boolean = false, msaa = false): void {
    const gl: WebGLRenderingContext & WebGL2RenderingContext = this._rhi.gl;
    const isWebGL2: boolean = this._rhi.isWebGL2;

    gl.bindFramebuffer(
      isWebGL2 ? (read ? gl.READ_FRAMEBUFFER : gl.DRAW_FRAMEBUFFER) : gl.FRAMEBUFFER,
      msaa ? this._MSAAFrameBuffer : this._frameBuffer
    );
  }

  /**
   * 解绑 FBO
   */
  public _unbind(): void {
    const gl: WebGLRenderingContext & WebGL2RenderingContext = this._rhi.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  /**
   * 设置渲染到立方体纹理的哪个面
   * @param faceIndex - 立方体纹理面
   * */
  public _setRenderTargetCubeFace(faceIndex: TextureCubeFace): void {
    const gl: WebGLRenderingContext & WebGL2RenderingContext = this._rhi.gl;
    const colorTexture = this._colorTextures[0];
    const depthTexture = this._depthTexture;

    if (this._antiAliasing > 1) {
      this._bind(false, true);
    } else {
      this._bind();
    }

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
      const { attachment } = depthTexture._formatDetail;
      gl.framebufferTexture2D(
        gl.FRAMEBUFFER,
        attachment,
        gl.TEXTURE_CUBE_MAP_POSITIVE_X + faceIndex,
        depthTexture._glTexture,
        0
      );
    }

    this._unbind();
  }

  /** blit FBO */
  public _blitRenderTarget(): void {
    if (!this._MSAAFrameBuffer) return;

    const gl: WebGLRenderingContext & WebGL2RenderingContext = this._rhi.gl;
    const oriAttachments = this._colorTextures.map(
      (v: RenderColorTexture, index: number) => gl.COLOR_ATTACHMENT0 + index
    );

    this._bind(true, true);
    this._bind();

    if (this._colorTextures.length > 1) {
      for (let i = 0; i < this._colorTextures.length; i++) {
        const attachments = this._colorTextures.map((v: RenderColorTexture, index: number) =>
          index === i ? gl.COLOR_ATTACHMENT0 + i : gl.NONE
        );
        gl.readBuffer(gl.COLOR_ATTACHMENT0 + i);
        gl.drawBuffers(attachments);
        gl.blitFramebuffer(
          0,
          0,
          this._width,
          this._height,
          0,
          0,
          this._width,
          this._height,
          gl.COLOR_BUFFER_BIT,
          gl.NEAREST
        );
      }

      gl.drawBuffers(oriAttachments);
    } else {
      gl.blitFramebuffer(
        0,
        0,
        this._width,
        this._height,
        0,
        0,
        this._width,
        this._height,
        gl.COLOR_BUFFER_BIT,
        gl.NEAREST
      );
    }

    this._unbind();
  }

  /**
   * 更新 MSAA 抗锯齿，只有 WeGLl2 才支持
   */
  private _initMSAA(depthFormat: GLint): void {
    const gl: WebGLRenderingContext & WebGL2RenderingContext = this._rhi.gl;
    const MSAAFrameBuffer = gl.createFramebuffer();
    const MSAADepthRenderBuffer = gl.createRenderbuffer();

    this._MSAAFrameBuffer = MSAAFrameBuffer;

    this._bind(false, true);

    // prepare MRT+MSAA color RBO
    for (let i = 0; i < this._colorTextures.length; i++) {
      const MSAAColorRenderBuffer = gl.createRenderbuffer();
      const { internalFormat } = this._colorTextures[i]._formatDetail;
      gl.bindRenderbuffer(gl.RENDERBUFFER, MSAAColorRenderBuffer);
      gl.renderbufferStorageMultisample(gl.RENDERBUFFER, this._antiAliasing, internalFormat, this._width, this._height);
      gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0 + i, gl.RENDERBUFFER, MSAAColorRenderBuffer);
    }

    // prepare MSAA depth RBO
    gl.bindRenderbuffer(gl.RENDERBUFFER, MSAADepthRenderBuffer);
    gl.renderbufferStorageMultisample(gl.RENDERBUFFER, this._antiAliasing, depthFormat, this._width, this._height);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, MSAADepthRenderBuffer);

    this._unbind();
  }

  /** -------------------@deprecated------------------------ */

  public width: number;
  public height: number;
  public clearColor: Array<number>;

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
