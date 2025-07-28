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
 * MSAA manager for WebGL render targets.
 * Handles all MSAA-related operations separately from the main render target logic.
 */
class MSAAManager {
  private _gl: WebGLRenderingContext & WebGL2RenderingContext;
  private _isWebGL2: boolean;
  private _target: RenderTarget;
  private _frameBuffer: WebGLFramebuffer;
  private _colorRenderBuffers: WebGLRenderbuffer[] = [];
  private _depthRenderBuffer: WebGLRenderbuffer | null = null;
  private _blitDrawBuffers: GLenum[] = [];
  private _oriDrawBuffers: GLenum[];

  constructor(
    gl: WebGLRenderingContext & WebGL2RenderingContext,
    isWebGL2: boolean,
    target: RenderTarget,
    oriDrawBuffers: GLenum[]
  ) {
    this._gl = gl;
    this._isWebGL2 = isWebGL2;
    this._target = target;
    this._oriDrawBuffers = oriDrawBuffers;
    this._frameBuffer = this._gl.createFramebuffer();
    
    this._bindFBO();
  }

  /**
   * Activate MSAA frame buffer for rendering.
   */
  activate(): void {
    this._gl.bindFramebuffer(this._gl.FRAMEBUFFER, this._frameBuffer);
  }

  /**
   * Resolve MSAA frame buffer to target frame buffer.
   */
  resolveTo(targetFrameBuffer: WebGLFramebuffer): void {
    const gl = this._gl;
    const mask = gl.COLOR_BUFFER_BIT | (this._target.depthTexture ? gl.DEPTH_BUFFER_BIT : 0);
    const { colorTextureCount, width, height } = this._target;

    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, this._frameBuffer);
    gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, targetFrameBuffer);

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
   * Destroy MSAA resources.
   */
  destroy(): void {
    const gl = this._gl;

    if (this._frameBuffer) {
      gl.deleteFramebuffer(this._frameBuffer);
      this._frameBuffer = null;
    }

    if (this._depthRenderBuffer) {
      gl.deleteRenderbuffer(this._depthRenderBuffer);
      this._depthRenderBuffer = null;
    }

    for (let i = 0; i < this._colorRenderBuffers.length; i++) {
      gl.deleteRenderbuffer(this._colorRenderBuffers[i]);
    }
    this._colorRenderBuffers.length = 0;
  }

  private _bindFBO(): void {
    const gl = this._gl;
    const isWebGL2 = this._isWebGL2;
    const depthRenderBuffer = gl.createRenderbuffer();

    /** @ts-ignore */
    const { _depth, colorTextureCount, antiAliasing, width, height } = this._target;

    this._blitDrawBuffers = new Array(colorTextureCount);
    this._depthRenderBuffer = depthRenderBuffer;

    gl.bindFramebuffer(gl.FRAMEBUFFER, this._frameBuffer);

    // prepare MRT+MSAA color RBOs
    for (let i = 0; i < colorTextureCount; i++) {
      const colorRenderBuffer = gl.createRenderbuffer();

      this._colorRenderBuffers[i] = colorRenderBuffer;
      this._blitDrawBuffers[i] = gl.NONE;

      gl.bindRenderbuffer(gl.RENDERBUFFER, colorRenderBuffer);
      gl.renderbufferStorageMultisample(
        gl.RENDERBUFFER,
        antiAliasing,
        /** @ts-ignore */
        (this._target.getColorTexture(i)._platformTexture as GLTexture)._formatDetail.internalFormat,
        width,
        height
      );
      gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0 + i, gl.RENDERBUFFER, colorRenderBuffer);
    }
    gl.drawBuffers(this._oriDrawBuffers);

    // prepare MSAA depth RBO
    if (_depth !== null) {
      const { internalFormat, attachment } =
        _depth instanceof Texture
          ? /** @ts-ignore */
            (_depth._platformTexture as GLTexture)._formatDetail
          : GLTexture._getRenderBufferDepthFormatDetail(_depth, gl, isWebGL2);

      gl.bindRenderbuffer(gl.RENDERBUFFER, depthRenderBuffer);
      gl.renderbufferStorageMultisample(gl.RENDERBUFFER, antiAliasing, internalFormat, width, height);
      gl.framebufferRenderbuffer(gl.FRAMEBUFFER, attachment, gl.RENDERBUFFER, depthRenderBuffer);
    }

    GLRenderTarget.checkFrameBufferStatus(gl);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.bindRenderbuffer(gl.RENDERBUFFER, null);
  }
}

/**
 * The render target in WebGL platform is used for off-screen rendering.
 */
export class GLRenderTarget implements IPlatformRenderTarget {
  /**
   * Check frame buffer status and throw error if invalid.
   * Static utility method that can be used by any component that creates FrameBuffers.
   */
  static checkFrameBufferStatus(gl: WebGLRenderingContext | WebGL2RenderingContext): void {
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
        // #5.14.3 Event Types in https://registry.khronos.org/webgl/specs/1.0.0/
        if (!gl.isContextLost()) {
          throw new Error(
            "The format of the attachment is not supported or if depth and stencil attachments are not the same renderbuffer"
          );
        }
        break;
      case (gl as WebGL2RenderingContext).FRAMEBUFFER_INCOMPLETE_MULTISAMPLE: // Only for WebGL2
        throw new Error(
          "The values of gl.RENDERBUFFER_SAMPLES are different among attached renderbuffers, or are non-zero if the attached images are a mix of renderbuffers and textures."
        );
    }
  }

  private _gl: WebGLRenderingContext & WebGL2RenderingContext;
  private _isWebGL2: boolean;
  private _target: RenderTarget;
  private _frameBuffer: WebGLFramebuffer;
  private _depthRenderBuffer: WebGLRenderbuffer | null;
  private _oriDrawBuffers: GLenum[];
  private _curMipLevel: number = 0;
  private _curFaceIndex: TextureCubeFace = undefined;
  
  // MSAA manager handles all MSAA-related operations
  private _msaaManager: MSAAManager | null = null;

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

    for (let i = 0, n = _colorTextures.length; i < n; i++) {
      const { format, isSRGBColorSpace } = _colorTextures[i];
      if (!GLTexture._supportRenderBufferColorFormat(format, rhi)) {
        throw new Error(`TextureFormat is not supported:${TextureFormat[format]} in RenderTarget`);
      }
      if (isSRGBColorSpace && format === TextureFormat.R8G8B8) {
        throw new Error(`If you want to use sRGB color space, only R8G8B8A8 format is supported in RenderTarget`);
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
      this._msaaManager = new MSAAManager(this._gl, this._isWebGL2, target, this._oriDrawBuffers);
    }
  }

  /**
   * Set which face and mipLevel of the cube texture to render to.
   * @param mipLevel - Set mip level the data want to write
   * @param faceIndex - Cube texture face
   */
  activeRenderTarget(mipLevel: number, faceIndex?: TextureCubeFace): void {
    // @todo: support MRT
    const { _gl: gl, _target: target } = this;

    gl.bindFramebuffer(gl.FRAMEBUFFER, this._frameBuffer);

    const mipChanged = mipLevel !== this._curMipLevel;
    const faceChanged = faceIndex !== this._curFaceIndex;

    const colorTexture = target.getColorTexture(0);
    if (colorTexture) {
      const isCube = colorTexture instanceof TextureCube;
      if (mipChanged || (isCube && faceChanged)) {
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

    const { depthTexture } = target;
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
    this._curFaceIndex = faceIndex;

    if (this._msaaManager) {
      this._msaaManager.activate();
    }
  }

  /**
   * Blit FBO.
   */
  blitRenderTarget(): void {
    if (this._msaaManager) {
      this._msaaManager.resolveTo(this._frameBuffer);
    }
  }

  /**
   * Destroy render target.
   */
  destroy(): void {
    const gl = this._gl;

    this._frameBuffer && gl.deleteFramebuffer(this._frameBuffer);
    this._depthRenderBuffer && gl.deleteRenderbuffer(this._depthRenderBuffer);

    if (this._msaaManager) {
      this._msaaManager.destroy();
      this._msaaManager = null;
    }

    this._frameBuffer = null;
    this._depthRenderBuffer = null;
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
}
