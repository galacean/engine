import { RenderTarget } from "@alipay/o3-material";
import { GLCapabilityType, Logger } from "@alipay/o3-base";
import { MathUtil } from "@alipay/o3-math";
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
  private renderTarget: RenderTarget;

  private glTexture: GLTexture2D;
  private glDepthTexture: GLTexture2D;
  private glCubeTexture: GLTextureCubeMap;

  private frameBuffer: WebGLFramebuffer;
  private depthRenderBuffer: WebGLRenderbuffer;

  /** WebGL2 时，可以开启硬件层的 MSAA */
  private MSAAFrameBuffer: WebGLFramebuffer;
  private MSAAColorRenderBuffer: WebGLRenderbuffer;
  private MSAADepthRenderBuffer: WebGLRenderbuffer;

  constructor(rhi: GLRenderHardware, renderTarget: RenderTarget) {
    super(rhi, renderTarget);
    this.renderTarget = renderTarget;
    this.initialize();
  }

  /**
   * 激活 RenderTarget 对象，后续的内容将会被渲染到当前激活 RenderTarget 对象上
   * @private
   */
  activeRenderTarget() {
    const gl = this.rhi.gl;
    const { width, height, texture, cubeTexture, depthTexture } = this.renderTarget;

    if (this.MSAAFrameBuffer) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.MSAAFrameBuffer);
    } else {
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.frameBuffer);
    }
    gl.viewport(0.0, 0.0, width, height);

    // 激活一下Texture资源, 否则可能会被释放掉
    if (cubeTexture) {
      this.rhi.assetsCache.requireObject(cubeTexture, GLTextureCubeMap);
    } else {
      this.rhi.assetsCache.requireObject(texture, GLTexture2D);
      if (depthTexture) {
        this.rhi.assetsCache.requireObject(depthTexture, GLTexture2D);
      }
    }
  }

  /**
   * 设置渲染到立方体纹理的面
   * @param {number} faceIndex - gl.TEXTURE_CUBE_MAP_POSITIVE_X + faceIndex
   * */
  setRenderTargetFace(faceIndex: number) {
    if (!this.glCubeTexture) return;

    const gl = this.rhi.gl;

    // 状态机切换到当前纹理
    this.glCubeTexture.activeBinding(0);

    // 绑定颜色纹理
    gl.framebufferTexture2D(
      gl.FRAMEBUFFER,
      gl.COLOR_ATTACHMENT0,
      gl.TEXTURE_CUBE_MAP_POSITIVE_X + faceIndex,
      this.glCubeTexture.glTexture,
      0
    );
  }

  /**
   /** 根据运行环境获取真实的采样数 */
  getExactSamples(samples: number) {
    const canUseMS = this.rhi.canIUse(GLCapabilityType.multipleSample);
    const gl = this.rhi.gl;
    if (canUseMS) {
      const maxSamples = gl.getParameter(gl.MAX_SAMPLES);
      return MathUtil.clamp(samples, 1, maxSamples);
    } else {
      return 1;
    }
  }

  /** 初始化硬件层 MSAA  */
  initMSAA() {
    const gl = this.rhi.gl;
    const { width, height, samples } = this.renderTarget;

    this.MSAAFrameBuffer = gl.createFramebuffer();
    this.MSAAColorRenderBuffer = gl.createRenderbuffer();
    this.MSAADepthRenderBuffer = gl.createRenderbuffer();

    gl.bindFramebuffer(gl.FRAMEBUFFER, this.MSAAFrameBuffer);

    // prepare MSAA RBO
    gl.bindRenderbuffer(gl.RENDERBUFFER, this.MSAAColorRenderBuffer);
    gl.renderbufferStorageMultisample(gl.RENDERBUFFER, samples, gl.RGBA8, width, height);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.RENDERBUFFER, this.MSAAColorRenderBuffer);

    // prepare depth RBO
    gl.bindRenderbuffer(gl.RENDERBUFFER, this.MSAADepthRenderBuffer);
    gl.renderbufferStorageMultisample(gl.RENDERBUFFER, samples, gl.DEPTH_COMPONENT32F, width, height);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, this.MSAADepthRenderBuffer);

    // 检查帧缓冲区对象是否被正确设置
    const e = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
    if (gl.FRAMEBUFFER_COMPLETE !== e) {
      Logger.error("MSAA Frame buffer error: " + e.toString());
      return;
    }

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  /** blit FBO */
  blitRenderTarget() {
    if (!this.MSAAFrameBuffer) return;

    const gl = this.rhi.gl;
    const { width, height } = this.renderTarget;
    let mask = gl.COLOR_BUFFER_BIT;
    if (this.glDepthTexture) {
      mask = gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT;
    }

    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, this.MSAAFrameBuffer);
    gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, this.frameBuffer);
    gl.blitFramebuffer(0, 0, width, height, 0, 0, width, height, mask, gl.NEAREST);
  }

  /** 初始化 RenderTarget
   * @private
   */
  initialize() {
    const gl = this.rhi.gl;
    const { width, height, texture, cubeTexture, depthTexture } = this.renderTarget;
    const isWebGL2 = this.rhi.isWebGL2;

    // 创建帧缓冲区对象
    /** 用户输入的采样数 */
    let samples = this.renderTarget.samples;
    /** 实际采样数 */
    samples = this.renderTarget.samples = this.getExactSamples(samples);
    if (samples > 1) {
      this.initMSAA();
    }

    this.frameBuffer = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.frameBuffer);

    /**
     * 渲染到立方体纹理
     * */
    if (cubeTexture) {
      // 创建纹理对象并设置其尺寸和参数
      this.glCubeTexture = this.rhi.assetsCache.requireObject(cubeTexture, GLTextureCubeMap);
      this.glCubeTexture.activeBinding(0);
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

      // frameBuffer 绑定 depthRenderBuffer
      this.depthRenderBuffer = gl.createRenderbuffer();
      gl.bindRenderbuffer(gl.RENDERBUFFER, this.depthRenderBuffer);
      gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, width, height);
      gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, this.depthRenderBuffer);
    } else {
      /**
       * 渲染到平面纹理
       * */
      // 创建纹理对象并设置其尺寸和参数
      this.glTexture = this.rhi.assetsCache.requireObject(texture, GLTexture2D);
      this.glTexture.activeBinding(0);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);

      // 创建深度纹理或者绑定深度RBO
      if (depthTexture && this.rhi.canIUse(GLCapabilityType.depthTexture)) {
        // 创建深度纹理
        this.glDepthTexture = this.rhi.assetsCache.requireObject(depthTexture, GLTexture2D);
        this.glDepthTexture.activeBinding(0);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texImage2D(
          gl.TEXTURE_2D,
          0,
          isWebGL2 ? gl.DEPTH_COMPONENT32F : gl.DEPTH_COMPONENT,
          width,
          height,
          0,
          gl.DEPTH_COMPONENT,
          isWebGL2 ? gl.FLOAT : gl.UNSIGNED_SHORT,
          null
        );
      } else {
        // 创建渲染缓冲区对象并设置其尺寸和参数
        this.depthRenderBuffer = gl.createRenderbuffer();
        gl.bindRenderbuffer(gl.RENDERBUFFER, this.depthRenderBuffer);
        gl.renderbufferStorage(gl.RENDERBUFFER, isWebGL2 ? gl.DEPTH_COMPONENT32F : gl.DEPTH_COMPONENT16, width, height);
      }

      // 绑定颜色纹理
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.glTexture.glTexture, 0);

      // 绑定深度纹理或者深度RBO
      if (depthTexture) {
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, this.glDepthTexture.glTexture, 0);
      } else {
        gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, this.depthRenderBuffer);
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

    if (this.glTexture) {
      this.glTexture.finalize();
    }
    if (this.glDepthTexture) {
      this.glDepthTexture.finalize();
    }
    if (this.glCubeTexture) {
      this.glCubeTexture.finalize();
    }

    if (this.frameBuffer) {
      gl.deleteFramebuffer(this.frameBuffer);
    }

    if (this.depthRenderBuffer) {
      gl.deleteRenderbuffer(this.depthRenderBuffer);
    }
    this.glTexture = null;
    this.glDepthTexture = null;
    this.glCubeTexture = null;

    this.frameBuffer = null;
    this.depthRenderBuffer = null;
  }
}
