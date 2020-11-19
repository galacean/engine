import {
  GLCapabilityType,
  IPlatformRenderTarget,
  Logger,
  RenderBufferDepthFormat,
  RenderColorTexture,
  RenderDepthTexture,
  RenderTarget,
  TextureCubeFace
} from "@oasis-engine/core";
import { GLRenderColorTexture } from "./GLRenderColorTexture";
import { GLRenderDepthTexture } from "./GLRenderDepthTexture";
import { GLTexture } from "./GLTexture";
import { WebGLRenderer } from "./WebGLRenderer";

export class GLRenderTarget implements IPlatformRenderTarget {
  _gl: WebGLRenderingContext & WebGL2RenderingContext;
  _isWebGL2: boolean;
  _target: RenderTarget;
  _frameBuffer: WebGLFramebuffer;
  _MSAAFrameBuffer: WebGLFramebuffer | null;

  /** @internal */
  private _depthRenderBuffer: WebGLRenderbuffer | null;
  /** @internal */
  private _MSAAColorRenderBuffers: WebGLRenderbuffer[] = [];
  /** @internal */
  private _MSAADepthRenderBuffer: WebGLRenderbuffer | null;
  /** @internal */
  private _oriDrawBuffers: GLenum[];
  /** @internal */
  private _blitDrawBuffers: GLenum[] | null;

  constructor(rhi: WebGLRenderer, target: RenderTarget) {
    this._gl = rhi.gl as WebGLRenderingContext & WebGL2RenderingContext;
    this._isWebGL2 = rhi.isWebGL2;
    this._target = target;

    const { _colorTextures, _depth, width, height } = target;

    /** todo
     * MRT + Cube + [,MSAA]
     * MRT + MSAA
     */

    if (!(_depth instanceof RenderDepthTexture) && !GLTexture._supportRenderBufferDepthFormat(_depth, rhi, false)) {
      throw new Error(`RenderBufferDepthFormat is not supported:${RenderBufferDepthFormat[_depth]}`);
    }

    if (_colorTextures.length > 1 && !rhi.canIUse(GLCapabilityType.drawBuffers)) {
      throw new Error("MRT is not supported");
    }

    if (_colorTextures.some((v: RenderColorTexture) => v.width !== width || v.height !== height)) {
      throw new Error("RenderColorTexture's size must as same as RenderTarget");
    }

    if (_depth instanceof RenderDepthTexture && (_depth.width !== width || _depth.height !== height)) {
      throw new Error("RenderDepthTexture's size must as same as RenderTarget");
    }

    // todo: necessary to support MRT + Cube + [,MSAA] ?
    if (_colorTextures.length > 1 && _colorTextures.some((v: RenderColorTexture) => v._isCube)) {
      throw new Error("MRT+Cube+[,MSAA] is not supported");
    }

    const maxAntiAliasing = rhi.capability.maxAntiAliasing;
    if (target._antiAliasing > maxAntiAliasing) {
      Logger.warn(`MSAA antiAliasing exceeds the limit and is automatically downgraded to:${maxAntiAliasing}`);
      target._antiAliasing = maxAntiAliasing;
    }

    this._frameBuffer = this._gl.createFramebuffer();

    // 绑定主 FBO
    this._bindMainFBO();

    // 绑定 MSAA FBO
    if (target._antiAliasing > 1) {
      this._MSAAFrameBuffer = this._gl.createFramebuffer();
      this._bindMSAAFBO();
    }
  }

  /**
   * 激活 RenderTarget 对象
   * 如果开启 MSAA,则激活 MSAA FBO,后续进行 this._blitRenderTarget() 进行交换 FBO
   * 如果未开启 MSAA,则激活主 FBO
   */
  public _activeRenderTarget(): void {
    const gl = this._gl;

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
    const gl = this._gl;
    const colorTexture = this._target._colorTextures[0];
    const depthTexture = this._target.depthTexture;

    gl.bindFramebuffer(gl.FRAMEBUFFER, this._frameBuffer);

    // 绑定颜色纹理
    if (colorTexture?._isCube) {
      gl.framebufferTexture2D(
        gl.FRAMEBUFFER,
        gl.COLOR_ATTACHMENT0,
        gl.TEXTURE_CUBE_MAP_POSITIVE_X + faceIndex,
        (colorTexture._platformTexture as GLRenderColorTexture)._glTexture,
        0
      );
    }

    // 绑定深度纹理
    if (depthTexture?._isCube) {
      gl.framebufferTexture2D(
        gl.FRAMEBUFFER,
        (depthTexture._platformTexture as GLRenderDepthTexture)._formatDetail.attachment,
        gl.TEXTURE_CUBE_MAP_POSITIVE_X + faceIndex,
        (depthTexture._platformTexture as GLRenderDepthTexture)._glTexture,
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
    const gl = this._gl;
    const mask = gl.COLOR_BUFFER_BIT | (this._target.depthTexture ? gl.DEPTH_BUFFER_BIT : 0);
    const { colorTextureCount, width, height } = this._target;

    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, this._MSAAFrameBuffer);
    gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, this._frameBuffer);

    for (let textureIndex = 0; textureIndex < colorTextureCount; textureIndex++) {
      const attachment = gl.COLOR_ATTACHMENT0 + textureIndex;

      this._blitDrawBuffers[textureIndex] = attachment;

      gl.readBuffer(attachment);
      gl.drawBuffers(this._blitDrawBuffers);
      gl.blitFramebuffer(0, 0, width, height, 0, 0, width, height, mask, gl.NEAREST);

      this._blitDrawBuffers[textureIndex] = gl.NONE;
    }

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  /**
   * 销毁。
   */
  public destroy(): void {
    const gl = this._gl;

    this._frameBuffer && gl.deleteFramebuffer(this._frameBuffer);
    this._depthRenderBuffer && gl.deleteRenderbuffer(this._depthRenderBuffer);
    this._MSAAFrameBuffer && gl.deleteFramebuffer(this._MSAAFrameBuffer);
    this._MSAADepthRenderBuffer && gl.deleteRenderbuffer(this._MSAADepthRenderBuffer);

    for (let i = 0; i < this._MSAAColorRenderBuffers.length; i++) {
      gl.deleteRenderbuffer(this._MSAAColorRenderBuffers[i]);
    }

    this._frameBuffer = null;
    this._depthRenderBuffer = null;
    this._MSAAFrameBuffer = null;
    this._MSAAColorRenderBuffers.length = 0;
    this._MSAADepthRenderBuffer = null;
  }

  /**
   * @internal
   * 绑定主 FBO
   */
  private _bindMainFBO(): void {
    const gl = this._gl;
    const isWebGL2: boolean = this._isWebGL2;
    const { _depth, colorTextureCount, width, height } = this._target;
    const drawBuffers = new Array(colorTextureCount);

    gl.bindFramebuffer(gl.FRAMEBUFFER, this._frameBuffer);

    /** color render buffer */
    for (let i = 0; i < colorTextureCount; i++) {
      const colorTexture = this._target._colorTextures[i];
      const attachment = gl.COLOR_ATTACHMENT0 + i;

      drawBuffers[i] = attachment;

      // 立方体纹理请调用 _setRenderTargetFace()
      if (!colorTexture._isCube) {
        gl.framebufferTexture2D(
          gl.FRAMEBUFFER,
          attachment,
          gl.TEXTURE_2D,
          (colorTexture._platformTexture as GLRenderColorTexture)._glTexture,
          0
        );
      }
    }

    if (colorTextureCount > 1) {
      gl.drawBuffers(drawBuffers);
    }
    this._oriDrawBuffers = drawBuffers;

    /** depth render buffer */
    if (_depth !== null) {
      if (_depth instanceof RenderDepthTexture) {
        // 立方体纹理请调用 _setRenderTargetFace()
        if (!_depth._isCube) {
          gl.framebufferTexture2D(
            gl.FRAMEBUFFER,
            (_depth._platformTexture as GLRenderDepthTexture)._formatDetail.attachment,
            gl.TEXTURE_2D,
            (_depth._platformTexture as GLRenderDepthTexture)._glTexture,
            0
          );
        }
      } else if (this._target._antiAliasing <= 1) {
        const { internalFormat, attachment } = GLTexture._getRenderBufferDepthFormatDetail(_depth, gl, isWebGL2);
        const depthRenderBuffer = gl.createRenderbuffer();

        this._depthRenderBuffer = depthRenderBuffer;

        gl.bindRenderbuffer(gl.RENDERBUFFER, depthRenderBuffer);
        gl.renderbufferStorage(gl.RENDERBUFFER, internalFormat, width, height);
        gl.framebufferRenderbuffer(gl.FRAMEBUFFER, attachment, gl.RENDERBUFFER, depthRenderBuffer);
      }
    }

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.bindRenderbuffer(gl.RENDERBUFFER, null);
  }

  /**
   * 绑定 MSAA FBO
   */
  private _bindMSAAFBO(): void {
    const gl = this._gl;
    const isWebGL2 = this._isWebGL2;
    const MSAADepthRenderBuffer = gl.createRenderbuffer();
    const { _depth, _colorTextures, colorTextureCount, _antiAliasing, width, height } = this._target;

    this._blitDrawBuffers = new Array(colorTextureCount);
    this._MSAADepthRenderBuffer = MSAADepthRenderBuffer;

    gl.bindFramebuffer(gl.FRAMEBUFFER, this._MSAAFrameBuffer);

    // prepare MRT+MSAA color RBOs
    for (let i = 0; i < colorTextureCount; i++) {
      const MSAAColorRenderBuffer = gl.createRenderbuffer();

      this._MSAAColorRenderBuffers[i] = MSAAColorRenderBuffer;
      this._blitDrawBuffers[i] = gl.NONE;

      gl.bindRenderbuffer(gl.RENDERBUFFER, MSAAColorRenderBuffer);
      gl.renderbufferStorageMultisample(
        gl.RENDERBUFFER,
        _antiAliasing,
        (_colorTextures[i]._platformTexture as GLRenderColorTexture)._formatDetail.internalFormat,
        width,
        height
      );
      gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0 + i, gl.RENDERBUFFER, MSAAColorRenderBuffer);
    }
    gl.drawBuffers(this._oriDrawBuffers);

    // prepare MSAA depth RBO
    if (_depth !== null) {
      const { internalFormat, attachment } =
        _depth instanceof RenderDepthTexture
          ? (_depth._platformTexture as GLRenderDepthTexture)._formatDetail
          : GLTexture._getRenderBufferDepthFormatDetail(_depth, gl, isWebGL2);

      gl.bindRenderbuffer(gl.RENDERBUFFER, MSAADepthRenderBuffer);
      gl.renderbufferStorageMultisample(gl.RENDERBUFFER, _antiAliasing, internalFormat, width, height);
      gl.framebufferRenderbuffer(gl.FRAMEBUFFER, attachment, gl.RENDERBUFFER, MSAADepthRenderBuffer);
    }

    this._checkFrameBuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.bindRenderbuffer(gl.RENDERBUFFER, null);
  }

  /**
   * @internal
   * 检查 FBO
   */
  private _checkFrameBuffer(): void {
    const gl = this._gl;
    const isWebGL2 = this._isWebGL2;
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
}
