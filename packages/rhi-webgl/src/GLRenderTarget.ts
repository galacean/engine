import { Logger, GLCapabilityType } from "@alipay/o3-base";
import { GLTexture2D } from "./GLTexture2D";
import { GLTextureCubeMap } from "./GLTextureCubeMap";
import { GLAsset } from "./GLAsset";
import { GLRenderHardware } from "./GLRenderHardware";

/**
 * GL 层的 RenderTarget 资源管理和渲染调用处理
 * @class
 * @private
 */
export class GLRenderTarget extends GLAsset {
  private _config;

  private _glTexture: GLTexture2D;
  private _glDepthTexture: GLTexture2D;
  private _glCubeTexture: GLTextureCubeMap;

  private _depthBuffer: WebGLRenderbuffer;
  private _framebuffer: WebGLFramebuffer;

  constructor(rhi: GLRenderHardware, config) {
    super(rhi, config);
    this._config = config;

    this._initialize();
  }

  /**
   * 激活 RenderTarget 对象，后续的内容将会被渲染到当前激活 RenderTarget 对象上
   * @private
   */
  activeRenderTarget() {
    const gl = this.rhi.gl;

    gl.bindFramebuffer(gl.FRAMEBUFFER, this._framebuffer);
    gl.viewport(0.0, 0.0, this._config.width, this._config.height);

    // 激活一下Texture资源, 否则可能会被释放掉
    if (this._config.cubeTexture) {
      this.rhi.assetsCache.requireObject(this._config.cubeTexture, GLTextureCubeMap);
    } else {
      this.rhi.assetsCache.requireObject(this._config.texture, GLTexture2D);
      if (this._config.depthTexture) {
        this.rhi.assetsCache.requireObject(this._config.depthTexture, GLTexture2D);
      }
    }
  }

  /**
   * 设置渲染到立方体纹理的面
   * @param {number} faceIndex - gl.TEXTURE_CUBE_MAP_POSITIVE_X + faceIndex
   * */
  setRenderTargetFace(faceIndex: number) {
    if (!this._glCubeTexture) return;

    const gl = this.rhi.gl;

    // 状态机切换到当前纹理
    this._glCubeTexture.activeBinding(0);

    // 绑定颜色纹理
    gl.framebufferTexture2D(
      gl.FRAMEBUFFER,
      gl.COLOR_ATTACHMENT0,
      gl.TEXTURE_CUBE_MAP_POSITIVE_X + faceIndex,
      this._glCubeTexture.glTexture,
      0
    );
  }

  /**
   * 初始化 RenderTarget
   * @private
   */
  _initialize() {
    const gl = this.rhi.gl;
    const { width, height, texture, cubeTexture, depthTexture } = this._config;

    // 创建帧缓冲区对象
    this._framebuffer = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, this._framebuffer);

    /**
     * 渲染到立方体纹理
     * */
    if (cubeTexture) {
      // 创建纹理对象并设置其尺寸和参数
      this._glCubeTexture = this.rhi.assetsCache.requireObject(cubeTexture, GLTextureCubeMap);
      this._glCubeTexture.activeBinding(0);
      for (let faceIndex = 0; faceIndex < 6; faceIndex++) {
        gl.texImage2D(
          gl.TEXTURE_CUBE_MAP_POSITIVE_X + faceIndex,
          0,
          gl.RGBA,
          width,
          height,
          0,
          gl.RGBA,
          gl.UNSIGNED_BYTE,
          null
        );
      }

      // framebuffer 绑定 depthRenderBuffer
      this._depthBuffer = gl.createRenderbuffer();
      gl.bindRenderbuffer(gl.RENDERBUFFER, this._depthBuffer);
      gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, width, height);
      gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, this._depthBuffer);
    } else {
      /**
       * 渲染到平面纹理
       * */
      // 创建纹理对象并设置其尺寸和参数
      this._glTexture = this.rhi.assetsCache.requireObject(texture, GLTexture2D);
      this._glTexture.activeBinding(0);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);

      // 创建深度纹理或者绑定深度RBO
      if (depthTexture && this.rhi.canIUse(GLCapabilityType.depthTexture)) {
        // 创建深度纹理
        this._glDepthTexture = this.rhi.assetsCache.requireObject(depthTexture, GLTexture2D);
        this._glDepthTexture.activeBinding(0);
        gl.texImage2D(
          gl.TEXTURE_2D,
          0,
          gl.DEPTH_COMPONENT,
          width,
          height,
          0,
          gl.DEPTH_COMPONENT,
          gl.UNSIGNED_SHORT,
          null
        );
      } else {
        // 创建渲染缓冲区对象并设置其尺寸和参数
        this._depthBuffer = gl.createRenderbuffer();
        gl.bindRenderbuffer(gl.RENDERBUFFER, this._depthBuffer);
        gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, width, height);
      }

      // 绑定颜色纹理
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this._glTexture.glTexture, 0);

      // 绑定深度纹理或者深度RBO
      if (depthTexture) {
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, this._glDepthTexture.glTexture, 0);
      } else {
        gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, this._depthBuffer);
      }
    }

    // 检查帧缓冲区对象是否被正确设置
    const e = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
    if (gl.FRAMEBUFFER_COMPLETE !== e) {
      Logger.error("Frame buffer error: " + e.toString());
      return;
    }

    // 取消当前的focus对象
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.bindTexture(gl.TEXTURE_2D, null);
    gl.bindTexture(gl.TEXTURE_CUBE_MAP, null);
    if (cubeTexture || !depthTexture) {
      gl.bindRenderbuffer(gl.RENDERBUFFER, null);
    }
  }

  /**
   * 释放 GL 资源
   * @private
   */
  finalize() {
    const gl = this.rhi.gl;
    if (this._framebuffer) {
      gl.deleteFramebuffer(this._framebuffer);
      this._framebuffer = null;
    }

    // 自动释放的资源
    this._glTexture = null;
    this._glDepthTexture = null;
    this._glCubeTexture = null;

    if (this._depthBuffer) {
      gl.deleteRenderbuffer(this._depthBuffer);
      this._depthBuffer = null;
    }
  }
}
