import { EngineObject } from "../base";
import { GLCapabilityType } from "../base/Constant";
import { Logger } from "../base/Logger";
import { Engine } from "../Engine";
import { RenderBufferDepthFormat } from "./enums/RenderBufferDepthFormat";
import { TextureCubeFace } from "./enums/TextureCubeFace";
import { RenderColorTexture } from "./RenderColorTexture";
import { RenderDepthTexture } from "./RenderDepthTexture";
import { Texture } from "./Texture";

/**
 * The render target used for off-screen rendering.
 */
export class RenderTarget extends EngineObject {
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

  /**
   * Render target width.
   * @readonly
   */
  get width(): number {
    return this._width;
  }

  /**
   * Render target height.
   * @readonly
   */
  get height(): number {
    return this._height;
  }

  /**
   * Render color texture count.
   * @readonly
   */
  get colorTextureCount(): number {
    return this._colorTextures.length;
  }

  /**
   * Depth texture.
   * @readonly
   */
  get depthTexture(): RenderDepthTexture | null {
    return this._depthTexture;
  }

  /**
   * Anti-aliasing level.
   * @remarks If the anti-aliasing level set is greater than the maximum level supported by the hardware, the maximum level of the hardware will be used.
   * @readonly
   */
  get antiAliasing(): number {
    return this._antiAliasing;
  }

  /**
   * Create a render target through color texture and depth format.
   * @param engine - Define the engine to use for this off-screen rendering
   * @param width - Render target width
   * @param height - Render target height
   * @param colorTexture - Render color texture
   * @param depthFormat - Depth format. default RenderBufferDepthFormat.Depth, engine will automatically select the supported precision
   * @param antiAliasing - Anti-aliasing level, default is 1
   */
  constructor(
    engine: Engine,
    width: number,
    height: number,
    colorTexture: RenderColorTexture,
    depthFormat?: RenderBufferDepthFormat | null,
    antiAliasing?: number
  );

  /**
   * Create a render target through color texture and depth format.
   * @remarks If the color texture is not transmitted, only the depth texture is generated.
   * @param engine - Define the engine to use for this off-screen rendering
   * @param width - Render target width
   * @param height - Render target height
   * @param colorTexture - Render color texture
   * @param depthTexture - Render depth texture
   * @param antiAliasing - Anti-aliasing level, default is 1
   */
  constructor(
    engine: Engine,
    width: number,
    height: number,
    colorTexture: RenderColorTexture | null,
    depthTexture: RenderDepthTexture,
    antiAliasing?: number
  );

  /**
   * Create a render target with color texture array and depth format.
   * @param engine - Define the engine to use for this off-screen rendering
   * @param width - Render target width
   * @param height - Render target height
   * @param colorTextures - Render color texture array
   * @param depthFormat - Depth format. default RenderBufferDepthFormat.Depth,engine will automatically select the supported precision
   * @param antiAliasing - Anti-aliasing level, default is 1
   */
  constructor(
    engine: Engine,
    width: number,
    height: number,
    colorTextures: RenderColorTexture[],
    depthFormat?: RenderBufferDepthFormat | null,
    antiAliasing?: number
  );

  /**
   * Create a render target with color texture array and depth texture.
   * @param engine - Define the engine to use for this off-screen rendering
   * @param width - Render target width
   * @param height - Render target height
   * @param colorTextures - Render color texture array
   * @param depthTexture - Depth texture
   * @param antiAliasing - Anti-aliasing level, default is 1
   */
  constructor(
    engine: Engine,
    width: number,
    height: number,
    colorTextures: RenderColorTexture[],
    depthTexture: RenderDepthTexture,
    antiAliasing?: number
  );

  /**
   * @internal
   */
  constructor(
    engine: Engine,
    width: number,
    height: number,
    renderTexture: RenderColorTexture | Array<RenderColorTexture> | null,
    depth: RenderDepthTexture | RenderBufferDepthFormat | null = RenderBufferDepthFormat.Depth,
    antiAliasing: number = 1
  ) {
    super(engine);
    const rhi = engine._hardwareRenderer;

    /** @TODO
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

    // Handle this._colorTextures
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

    // TODO: necessary to support MRT + Cube + [,MSAA] ?
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

    // Bind main FBO
    this._bindMainFBO(depth);

    // Bind MSAA FBO
    if (antiAliasing > 1) {
      this._MSAAFrameBuffer = gl.createFramebuffer();
      this._bindMSAAFBO(depth);
    }
  }

  /**
   * Get the render color texture by index.
   * @param index
   */
  public getColorTexture(index: number = 0): RenderColorTexture | null {
    return this._colorTextures[index];
  }

  /**
   * Destroy render target.
   */
  public destroy(): void {
    const gl: WebGLRenderingContext & WebGL2RenderingContext = this._rhi.gl;

    gl.deleteFramebuffer(this._frameBuffer);
    this._depthRenderBuffer && gl.deleteRenderbuffer(this._depthRenderBuffer);
    this._MSAAFrameBuffer && gl.deleteFramebuffer(this._MSAAFrameBuffer);
    this._MSAADepthRenderBuffer && gl.deleteRenderbuffer(this._MSAADepthRenderBuffer);

    for (let i = 0; i < this._colorTextures.length; i++) {
      this._colorTextures[i].destroy();
    }

    for (let i = 0; i < this._MSAAColorRenderBuffers.length; i++) {
      gl.deleteRenderbuffer(this._MSAAColorRenderBuffers[i]);
    }

    this._depthTexture && this._depthTexture.destroy();

    this._frameBuffer = null;
    this._colorTextures.length = 0;
    this._depthTexture = null;
    this._depthRenderBuffer = null;
    this._MSAAFrameBuffer = null;
    this._MSAAColorRenderBuffers.length = 0;
    this._MSAADepthRenderBuffer = null;
  }

  /**
   * Activate this RenderTarget.
   * @remarks
   * If MSAA is turned on, MSAA FBO is activated, and then this._blitRenderTarget() is performed to exchange FBO.
   * If MSAA is not turned on, activate the main FBO.
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
   * Set which face of the cube texture to render to.
   * @param faceIndex - Cube texture face
   */
  public _setRenderTargetFace(faceIndex: TextureCubeFace = TextureCubeFace.PositiveX): void {
    const gl: WebGLRenderingContext & WebGL2RenderingContext = this._rhi.gl;
    const colorTexture = this._colorTextures[0];
    const depthTexture = this._depthTexture;

    gl.bindFramebuffer(gl.FRAMEBUFFER, this._frameBuffer);

    // Bind render color texture
    if (colorTexture?._isCube) {
      gl.framebufferTexture2D(
        gl.FRAMEBUFFER,
        gl.COLOR_ATTACHMENT0,
        gl.TEXTURE_CUBE_MAP_POSITIVE_X + faceIndex,
        colorTexture._glTexture,
        0
      );
    }

    // Bind depth texture
    if (depthTexture?._isCube) {
      gl.framebufferTexture2D(
        gl.FRAMEBUFFER,
        depthTexture._formatDetail.attachment,
        gl.TEXTURE_CUBE_MAP_POSITIVE_X + faceIndex,
        depthTexture._glTexture,
        0
      );
    }

    // Revert current activated render target
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
   * Bind main FBO.
   */
  private _bindMainFBO(renderDepth: RenderDepthTexture | RenderBufferDepthFormat | null): void {
    const gl: WebGLRenderingContext & WebGL2RenderingContext = this._rhi.gl;
    const isWebGL2: boolean = this._rhi.isWebGL2;
    const colorTextureLength = this._colorTextures.length;
    const drawBuffers = new Array(colorTextureLength);

    gl.bindFramebuffer(gl.FRAMEBUFFER, this._frameBuffer);

    /** Color render buffer */
    for (let i = 0; i < colorTextureLength; i++) {
      const colorTexture = this._colorTextures[i];
      const attachment = gl.COLOR_ATTACHMENT0 + i;

      drawBuffers[i] = attachment;

      // Cube texture please call _setRenderTargetFace()
      if (!colorTexture._isCube) {
        gl.framebufferTexture2D(gl.FRAMEBUFFER, attachment, gl.TEXTURE_2D, colorTexture._glTexture, 0);
      }
    }

    if (colorTextureLength > 1) {
      gl.drawBuffers(drawBuffers);
    }
    this._oriDrawBuffers = drawBuffers;

    /** Depth render buffer */
    if (renderDepth !== null) {
      if (renderDepth instanceof RenderDepthTexture) {
        // Cube texture _setRenderTargetFace()
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
    }

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.bindRenderbuffer(gl.RENDERBUFFER, null);
  }

  /**
   * Bind MSAA FBO.
   */
  private _bindMSAAFBO(renderDepth: RenderDepthTexture | RenderBufferDepthFormat | null): void {
    const gl: WebGLRenderingContext & WebGL2RenderingContext = this._rhi.gl;
    const isWebGL2: boolean = this._rhi.isWebGL2;
    const MSAADepthRenderBuffer = gl.createRenderbuffer();
    const colorTextureLength = this._colorTextures.length;

    this._blitDrawBuffers = new Array(colorTextureLength);
    this._MSAADepthRenderBuffer = MSAADepthRenderBuffer;

    gl.bindFramebuffer(gl.FRAMEBUFFER, this._MSAAFrameBuffer);

    // Prepare MRT+MSAA color RBOs
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

    // Prepare MSAA depth RBO
    if (renderDepth !== null) {
      const { internalFormat, attachment } =
        renderDepth instanceof RenderDepthTexture
          ? renderDepth._formatDetail
          : Texture._getRenderBufferDepthFormatDetail(renderDepth, gl, isWebGL2);

      gl.bindRenderbuffer(gl.RENDERBUFFER, MSAADepthRenderBuffer);
      gl.renderbufferStorageMultisample(gl.RENDERBUFFER, this._antiAliasing, internalFormat, this._width, this._height);
      gl.framebufferRenderbuffer(gl.FRAMEBUFFER, attachment, gl.RENDERBUFFER, MSAADepthRenderBuffer);
    }

    this._checkFrameBuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.bindRenderbuffer(gl.RENDERBUFFER, null);
  }

  /**
   * Check FBO.
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
}
