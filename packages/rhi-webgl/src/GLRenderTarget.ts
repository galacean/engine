import {
  GLCapabilityType,
  IPlatformRenderTarget,
  Logger,
  RenderTarget,
  Texture,
  TextureCube,
  TextureCubeFace,
  TextureFormat
} from "@galacean/engine-core";
import { GLTexture } from "./GLTexture";
import { WebGLGraphicDevice } from "./WebGLGraphicDevice";

/**
 * The render target in WebGL platform is used for off-screen rendering.
 */
export class GLRenderTarget implements IPlatformRenderTarget {
  private _gl: WebGLRenderingContext & WebGL2RenderingContext;
  private _isWebGL2: boolean;
  private _target: RenderTarget;
  private _frameBuffer: WebGLFramebuffer;
  private _MSAAFrameBuffer: WebGLFramebuffer | null;
  private _depthRenderBuffer: WebGLRenderbuffer | null;
  private _MSAAColorRenderBuffers: WebGLRenderbuffer[] = [];
  private _MSAADepthRenderBuffer: WebGLRenderbuffer | null;
  private _oriDrawBuffers: GLenum[];
  private _blitDrawBuffers: GLenum[] | null;
  private _curMipLevel: number = 0;

  /**
   * Create render target in WebGL platform.
   */
  constructor(rhi: WebGLGraphicDevice, target: RenderTarget) {
    this._gl = rhi.gl as WebGLRenderingContext & WebGL2RenderingContext;
    this._isWebGL2 = rhi.isWebGL2;
    this._target = target;

    /** @ts-ignore */
    const { _colorTextures, _depth, width, height } = target;
    const isDepthTexture = _depth instanceof Texture;

    /** todo
     * MRT + Cube + [,MSAA]
     * MRT + MSAA
     */

    for (let i = 0, n = _colorTextures.length; i < n; i++) {
      const format = _colorTextures[i]._format;
      if (!GLTexture._supportRenderBufferColorFormat(format, rhi)) {
        throw new Error(`TextureFormat is not supported:${TextureFormat[format]} in RenderTarget`);
      }
    }

    if (!isDepthTexture && !GLTexture._supportRenderBufferDepthFormat(_depth, rhi)) {
      throw new Error(`TextureFormat is not supported:${TextureFormat[_depth]} in RenderTarget`);
    }

    if (_colorTextures.length > 1 && !rhi.canIUse(GLCapabilityType.drawBuffers)) {
      throw new Error("MRT is not supported");
    }

    if (_colorTextures.some((v: Texture) => v.width !== width || v.height !== height)) {
      throw new Error("ColorTexture's size must as same as RenderTarget");
    }

    if (isDepthTexture && (_depth.width !== width || _depth.height !== height)) {
      throw new Error("DepthTexture's size must as same as RenderTarget");
    }

    // todo: necessary to support MRT + Cube + [,MSAA] ?
    if (_colorTextures.length > 1 && _colorTextures.some((v: Texture) => v instanceof TextureCube)) {
      throw new Error("MRT+Cube+[,MSAA] is not supported");
    }

    const maxAntiAliasing = rhi.capability.maxAntiAliasing;
    if (target.antiAliasing > maxAntiAliasing) {
      Logger.warn(`MSAA antiAliasing exceeds the limit and is automatically downgraded to:${maxAntiAliasing}`);

      /** @ts-ignore */
      target._antiAliasing = maxAntiAliasing;
    }

    this._frameBuffer = this._gl.createFramebuffer();

    // bind main FBO
    this._bindMainFBO();

    // bind MSAA FBO
    if (target.antiAliasing > 1) {
      this._MSAAFrameBuffer = this._gl.createFramebuffer();
      this._bindMSAAFBO();
    }
  }

  /**
   * Set which face and mipLevel of the cube texture to render to.
   * @param faceIndex - Cube texture face
   * @param mipLevel - Set mip level the data want to write
   */
  setRenderTargetInfo(faceIndex: TextureCubeFace, mipLevel: number): void {
    const { _gl: gl, _target: target } = this;
    const { depthTexture } = target;
    const colorTexture = target.getColorTexture(0);
    const mipChanged = mipLevel !== this._curMipLevel;

    gl.bindFramebuffer(gl.FRAMEBUFFER, this._frameBuffer);

    if (colorTexture) {
      const isCube = colorTexture instanceof TextureCube;
      if (mipChanged || isCube) {
        gl.framebufferTexture2D(
          gl.FRAMEBUFFER,
          gl.COLOR_ATTACHMENT0,
          isCube ? gl.TEXTURE_CUBE_MAP_POSITIVE_X + faceIndex : gl.TEXTURE_2D,
          // @ts-ignore
          (colorTexture._platformTexture as GLTexture)._glTexture,
          mipLevel
        );
      }
    }
    if (depthTexture) {
      const isCube = depthTexture instanceof TextureCube;
      if (mipChanged || isCube) {
        // @ts-ignore
        const platformTexture = <GLTexture>depthTexture._platformTexture;
        gl.framebufferTexture2D(
          gl.FRAMEBUFFER,
          platformTexture._formatDetail.attachment,
          isCube ? gl.TEXTURE_CUBE_MAP_POSITIVE_X + faceIndex : gl.TEXTURE_2D,
          platformTexture._glTexture,
          mipLevel
        );
      }
    } else {
      if (mipChanged) {
        // @ts-ignore
        const { internalFormat } = GLTexture._getRenderBufferDepthFormatDetail(target._depth, gl, this._isWebGL2);
        gl.bindRenderbuffer(gl.RENDERBUFFER, this._depthRenderBuffer);
        gl.renderbufferStorage(gl.RENDERBUFFER, internalFormat, target.width >> mipLevel, target.height >> mipLevel);
      }
    }
    this._curMipLevel = mipLevel;

    // revert current activated render target
    this._activeRenderTarget();
  }

  /**
   * Blit FBO.
   */
  blitRenderTarget(): void {
    if (!this._MSAAFrameBuffer) return;

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
   * Destroy render target.
   */
  destroy(): void {
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
   * Activate this RenderTarget.
   * @internal
   * @remarks
   * If MSAA is turned on, MSAA FBO is activated, and then this._blitRenderTarget() is performed to exchange FBO.
   * If MSAA is not turned on, activate the main FBO.
   */
  _activeRenderTarget(): void {
    const gl = this._gl;

    if (this._MSAAFrameBuffer) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, this._MSAAFrameBuffer);
    } else {
      gl.bindFramebuffer(gl.FRAMEBUFFER, this._frameBuffer);
    }
  }

  private _bindMainFBO(): void {
    const gl = this._gl;
    const isWebGL2: boolean = this._isWebGL2;

    /** @ts-ignore */
    const { _depth, colorTextureCount, width, height } = this._target;
    const drawBuffers = new Array(colorTextureCount);

    gl.bindFramebuffer(gl.FRAMEBUFFER, this._frameBuffer);

    /** color render buffer */
    for (let i = 0; i < colorTextureCount; i++) {
      const colorTexture = this._target.getColorTexture(i);
      const attachment = gl.COLOR_ATTACHMENT0 + i;

      drawBuffers[i] = attachment;

      if (!(colorTexture instanceof TextureCube)) {
        gl.framebufferTexture2D(
          gl.FRAMEBUFFER,
          attachment,
          gl.TEXTURE_2D,
          /** @ts-ignore */
          (colorTexture._platformTexture as GLTexture)._glTexture,
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
      if (_depth instanceof Texture && !(_depth instanceof TextureCube)) {
        // @ts-ignore
        const platformTexture = _depth._platformTexture as GLTexture;
        gl.framebufferTexture2D(
          gl.FRAMEBUFFER,
          platformTexture._formatDetail.attachment,
          gl.TEXTURE_2D,
          platformTexture._glTexture,
          0
        );
      } else if (this._target.antiAliasing <= 1) {
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

  private _bindMSAAFBO(): void {
    const gl = this._gl;
    const isWebGL2 = this._isWebGL2;
    const MSAADepthRenderBuffer = gl.createRenderbuffer();

    /** @ts-ignore */
    const { _depth, colorTextureCount, antiAliasing, width, height } = this._target;

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
        antiAliasing,
        /** @ts-ignore */
        (this._target.getColorTexture(i)._platformTexture as GLTexture)._formatDetail.internalFormat,
        width,
        height
      );
      gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0 + i, gl.RENDERBUFFER, MSAAColorRenderBuffer);
    }
    gl.drawBuffers(this._oriDrawBuffers);

    // prepare MSAA depth RBO
    if (_depth !== null) {
      const { internalFormat, attachment } =
        _depth instanceof Texture
          ? /** @ts-ignore */
            (_depth._platformTexture as GLTexture)._formatDetail
          : GLTexture._getRenderBufferDepthFormatDetail(_depth, gl, isWebGL2);

      gl.bindRenderbuffer(gl.RENDERBUFFER, MSAADepthRenderBuffer);
      gl.renderbufferStorageMultisample(gl.RENDERBUFFER, antiAliasing, internalFormat, width, height);
      gl.framebufferRenderbuffer(gl.FRAMEBUFFER, attachment, gl.RENDERBUFFER, MSAADepthRenderBuffer);
    }

    this._checkFrameBuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.bindRenderbuffer(gl.RENDERBUFFER, null);
  }

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
