import { RenderBufferDepthFormat, TextureFilter, TextureWrapMode, GLCapabilityType, Logger } from "@alipay/o3-base";
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
  private _rhi;
  private _frameBuffer: WebGLFramebuffer;
  private _colorTextures: Array<RenderColorTexture> = [];
  private _depthTexture: RenderDepthTexture | null;

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
    return 0;
  }
  set antiAliasing(value: number) {}

  /**
   * 通过颜色纹理和深度格式创建渲染目标，使用内部深度缓冲，无法获取深度纹理。
   * @param rhi - GPU 硬件抽象层
   * @param width - 宽
   * @param height - 高
   * @param colorTexture - 颜色纹理
   * @param depthFormat - 深度格式,默认 RenderBufferDepthFormat.Depth,自动选择精度
   */
  constructorNew(
    rhi,
    width: number,
    height: number,
    colorTexture: RenderColorTexture,
    depthFormat: RenderBufferDepthFormat
  );

  /**
   * 通过颜色纹理和深度纹理创建渲染目标。
   *
   * @param rhi - GPU 硬件抽象层
   * @param width - 宽
   * @param height - 高
   * @param colorTexture - 颜色纹理
   * @param depthTexture - 深度纹理
   */
  constructorNew(
    rhi,
    width: number,
    height: number,
    colorTexture: RenderColorTexture,
    depthTexture: RenderDepthTexture
  );

  /**
   * 只获取深度纹理
   *
   * @param rhi - GPU 硬件抽象层
   * @param width - 宽
   * @param height - 高
   * @param colorTexture - 颜色纹理为空
   * @param depthTexture - 深度纹理
   */
  constructorNew(rhi, width: number, height: number, colorTexture: null, depthTexture: RenderDepthTexture);

  /**
   * 通过颜色纹理数组和深度格式创建渲染目标，使用内部深度缓冲，无法获取深度纹理。
   * @param rhi - GPU 硬件抽象层
   * @param width - 宽
   * @param height - 高
   * @param colorTextures - 颜色纹理数组
   * @param depthFormat - 深度格式
   */
  constructorNew(
    rhi,
    width: number,
    height: number,
    colorTextures: Array<RenderColorTexture>,
    depthFormat: RenderBufferDepthFormat
  );

  /**
   * 通过颜色纹理数组和深度纹理创建渲染目标。
   * @param rhi - GPU 硬件抽象层
   * @param width - 宽
   * @param height - 高
   * @param colorTextures - 颜色纹理数组
   * @param depthTexture - 深度纹理
   */
  constructorNew(
    rhi,
    width: number,
    height: number,
    colorTextures: Array<RenderColorTexture>,
    depthTexture: RenderDepthTexture
  );

  /**
   * @internal
   */
  constructorNew(
    rhi,
    width: number,
    height: number,
    renderTexture: RenderColorTexture | Array<RenderColorTexture> | null,
    depth: RenderDepthTexture | RenderBufferDepthFormat
  ) {
    if ((renderTexture as Array<RenderColorTexture>)?.length > 1 && !rhi.canIUse(GLCapabilityType.drawBuffers)) {
      Logger.error("当前环境不支持 MRT,请先检测能力再使用");
      return;
    }
    const gl: WebGLRenderingContext & WebGL2RenderingContext = rhi.gl;
    const isWebGL2: boolean = rhi.isWebGL2;
    const frameBuffer = gl.createFramebuffer();
    const attachments = [];

    this._rhi = rhi;
    this._frameBuffer = frameBuffer;

    this._bind();

    /** color render buffer */
    this._colorTextures = [].concat.call([], renderTexture).filter((v: RenderColorTexture | null) => v);
    this._colorTextures.forEach((colorTexture: RenderColorTexture, index: number) => {
      const attachment = gl.COLOR_ATTACHMENT0 + index;

      colorTexture._bind();
      gl.framebufferTexture2D(gl.FRAMEBUFFER, attachment, gl.TEXTURE_2D, colorTexture._glTexture, 0);
      colorTexture._unbind();

      attachments.push(attachment);
    });

    if (this._colorTextures.length > 0) {
      gl.drawBuffers(attachments);
    }

    /** depth render buffer */
    if (depth instanceof RenderDepthTexture) {
      this._depthTexture = depth;

      depth._bind();
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, depth._glTexture, 0);
      depth._unbind();
    } else {
      const { internalFormat } = Texture._getFormatDetail(depth, gl, isWebGL2);
      const depthRenderBuffer = gl.createRenderbuffer();

      gl.bindRenderbuffer(gl.RENDERBUFFER, depthRenderBuffer);
      gl.renderbufferStorage(gl.RENDERBUFFER, internalFormat, width, height);
      gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, depthRenderBuffer);
    }

    this._unbind();
    gl.bindRenderbuffer(gl.RENDERBUFFER, null);
  }

  /**
   * 绑定 FBO
   * @param read  - 是否设置FBO作为读对象
   */
  public _bind(read: boolean = false) {
    const gl: WebGLRenderingContext & WebGL2RenderingContext = this._rhi.gl;
    const isWebGL2: boolean = this._rhi.isWebGL2;

    gl.bindFramebuffer(
      isWebGL2 ? (read ? gl.READ_FRAMEBUFFER : gl.DRAW_FRAMEBUFFER) : gl.FRAMEBUFFER,
      this._frameBuffer
    );
  }

  /**
   * 解绑 FBO
   */
  public _unbind() {
    const gl: WebGLRenderingContext & WebGL2RenderingContext = this._rhi.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  /**
   * 通过索引获取颜色纹理。
   * @param index
   */
  public getColorTexture(index: number = 0): RenderColorTexture | null {
    return this._colorTextures[index];
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
