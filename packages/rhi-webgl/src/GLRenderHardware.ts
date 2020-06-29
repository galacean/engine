import { Logger, ClearMode, GLCapabilityType } from "@alipay/o3-base";
import { RenderTarget } from "@alipay/o3-material";
import { RHIOption } from "@alipay/o3-core/types/type";
import { GLRenderStates } from "./GLRenderStates";
import { GLAssetsCache } from "./GLAssetsCache";
import { GLPrimitive } from "./GLPrimitive";
import { GLVAOPrimitive } from "./GLVAOPrimitive";
import { GLTechnique } from "./GLTechnique";
import { GLSpriteBatcher } from "./GLSpriteBatcher";
import { GLRenderTarget } from "./GLRenderTarget";
import { GLExtensions } from "./GLExtensions";
import { GLCapability } from "./GLCapability";
import { ACamera } from "@alipay/o3-core";
import { GLMultiRenderTarget } from "./GLMultiRenderTarget";
import { WebGLExtension } from "./type";

/**
 * GPU 硬件抽象层的 WebGL 的实现
 * @private
 */
export class GLRenderHardware {
  private _canvas: HTMLCanvasElement;
  private _gl: (WebGLRenderingContext & WebGLExtension) | WebGL2RenderingContext;
  private _renderStates;
  private _assetsCache: GLAssetsCache;
  private _extensions;
  private _frameCount: number;
  private _spriteBatcher;
  private _capability: GLCapability;
  private _isWebGL2: boolean;

  /** 当前 RHI 是否为 WebGL 2.0 */
  get isWebGL2() {
    return this._isWebGL2;
  }

  constructor(canvas: HTMLCanvasElement, option: RHIOption) {
    if (typeof canvas === "string") {
      this._canvas = document.getElementById(canvas) as HTMLCanvasElement;
    } else {
      this._canvas = canvas;
    }

    /** 若不设置 disableWebGL2 为 true，则默认自动优先使用 WebGL 2.0 */
    if (!option.disableWebGL2) {
      this._gl = <WebGL2RenderingContext>(
        (this._canvas.getContext("webgl2", option) || this._canvas.getContext("experimental-webgl2", option))
      );
      this._isWebGL2 = true;
    }

    if (!this._gl) {
      this._gl = <WebGLRenderingContext & WebGLExtension>(
        (this._canvas.getContext("webgl", option) || this._canvas.getContext("experimental-webgl", option))
      );
      this._isWebGL2 = false;
    }

    if (!this._gl) {
      throw new Error("Get GL Context FAILED.");
    }

    this._renderStates = new GLRenderStates(this._gl);

    this._assetsCache = new GLAssetsCache(this, option);

    this._extensions = new GLExtensions(this);

    this._capability = new GLCapability(this);

    this._frameCount = 0;
  }

  /**
   * GL Context 对象
   * @member {WebGLRenderingContext}
   * @readonly
   */
  get gl() {
    return this._gl;
  }

  /**
   * Canvas 对象
   * @member
   * @readonly
   */
  get canvas() {
    return this._canvas;
  }

  /**
   * GL 资源对象缓冲池
   */
  get assetsCache(): GLAssetsCache {
    return this._assetsCache;
  }

  /**
   * GL 状态管理器
   */
  get renderStates(): GLRenderStates {
    return this._renderStates;
  }

  /**
   * GL 能力管理
   * */
  get capability(): GLCapability {
    return this._capability;
  }

  /**
   * 当前帧的计数
   */
  get frameCount() {
    return this._frameCount;
  }

  /**
   * 请求扩展
   * @param {String} ext 扩展名
   * @returns {Object|null} 请求结果，返回插件对象或null
   */
  requireExtension(ext) {
    return this._extensions.requireExtension(ext);
  }

  /**
   * 查询能否使用某些 GL 能力
   * */
  canIUse(capabilityType: GLCapabilityType) {
    return this.capability.canIUse(capabilityType);
  }

  /**
   * 查询能否使用某种压缩纹理格式
   * */
  canIUseCompressedTextureInternalFormat(type: number) {
    return this.capability.canIUseCompressedTextureInternalFormat(type);
  }

  /** 是否能使用更多骨骼关节 */
  public get canIUseMoreJoints() {
    return this.capability.canIUseMoreJoints;
  }

  /**
   * 设置视口区域
   * @param {number} x 用来设定视口的左下角水平坐标
   * @param {number} y 用来设定视口的左下角垂直坐标
   * @param {number} width 用来设定视口的宽度
   * @param {number} height 用来设定视口的高度
   */
  viewport(x, y, width, height) {
    // 开启裁剪
    // gl.enable(gl.SCISSOR_TEST);
    // gl.scissor(x, transformY, width, height);
    const gl = this._gl;
    gl.viewport(x, gl.drawingBufferHeight - y - height, width, height);
  }

  colorMask(r, g, b, a) {
    this._gl.colorMask(r, g, b, a);
  }

  /**
   * 在一帧的渲染开始时，处理内部状态
   */
  beginFrame() {
    this._frameCount++;
  }

  /**
   * 清空渲染缓冲
   * @param {ClearMode} clearMode
   * @param {*} clearParam
   */
  clearRenderTarget(clearMode, clearParam) {
    const gl = this._gl;

    switch (clearMode) {
      case ClearMode.SOLID_COLOR: // solid color
        gl.clearColor(clearParam[0], clearParam[1], clearParam[2], clearParam[3]);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
        break;
      case ClearMode.DEPTH_ONLY: // depth only
        gl.clear(gl.DEPTH_BUFFER_BIT);
        break;
      case ClearMode.COLOR_ONLY:
        gl.clearColor(clearParam[0], clearParam[1], clearParam[2], clearParam[3]);
        gl.clear(gl.COLOR_BUFFER_BIT);
        break;
      case ClearMode.STENCIL_ONLY:
        gl.clear(gl.STENCIL_BUFFER_BIT);
        break;
      case ClearMode.ALL_CLEAR:
        gl.clearColor(clearParam[0], clearParam[1], clearParam[2], clearParam[3]);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT | gl.STENCIL_BUFFER_BIT);
        break;

      case ClearMode.DONT_CLEAR: // dont clear
        break;
    }
  }

  /**
   * 使用指定的材质绘制一个 Primitive
   * @param {Primitive} primitive
   * @param {Material} mtl
   */
  drawPrimitive(primitive, mtl) {
    // todo: VAO 不支持 morph 动画
    const glPrimitive = this._assetsCache.requireObject(
      primitive,
      this.canIUse(GLCapabilityType.vertexArrayObject) && !primitive.targets.length ? GLVAOPrimitive : GLPrimitive
    );
    const glTech = this._assetsCache.requireObject(mtl.technique, GLTechnique);

    if (glPrimitive && glTech) {
      glTech.begin(mtl);
      glPrimitive.draw(glTech);
      glTech.end();
    } else {
      Logger.error("draw primitive failed.");
    }
  }

  /**
   * 把一个 Sprite 绘制需要的信息传进来
   * @param {Object} positionQuad  Sprite四个顶点的位置
   * @param {Object} uvRect        Sprite在texture上的纹理坐标
   * @param {vec4}   tintColor     颜色
   * @param {Texture}   texture    纹理信息
   * @param {String}    renderMode    绘制方式， '2D' 或者 '3D'
   * @param {ACamera}   camera        相机信息
   */
  drawSprite(positionQuad, uvRect, tintColor, texture, renderMode, camera) {
    // _spriteBatcher只有在需要的时候才会创建
    if (!this._spriteBatcher) {
      this._spriteBatcher = new GLSpriteBatcher(this);
    }

    this._spriteBatcher.drawSprite(positionQuad, uvRect, tintColor, texture, renderMode, camera);
  }

  /**
   * 给 SpriteRenderPass 在最后调用，确保所有 Sprite 绘制
   */
  flushSprite() {
    if (this._spriteBatcher) {
      this._spriteBatcher.flush();
    }
  }

  /**
   * 激活指定的RenderTarget
   * @param {RenderTarget} renderTarget  需要被激活的RenderTarget对象，如果未设置，则渲染到屏幕帧
   */
  activeRenderTarget(renderTarget: RenderTarget, camera: ACamera) {
    if (renderTarget) {
      const TargetClazz = renderTarget.isMulti ? GLMultiRenderTarget : GLRenderTarget;
      const glRenderTarget = this._assetsCache.requireObject(renderTarget, TargetClazz);
      glRenderTarget.activeRenderTarget();
    } else {
      const gl = this._gl;
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      this.viewport(camera.viewport[0], camera.viewport[1], camera.viewport[2], camera.viewport[3]);
    }
  }

  /** blit FBO */
  blitRenderTarget(renderTarget: RenderTarget) {
    if (renderTarget) {
      const glRenderTarget = this._assetsCache.requireObject(renderTarget, GLRenderTarget);
      glRenderTarget.blitRenderTarget();
    }
  }

  /**
   * 设置渲染到立方体纹理的面
   * @param {RenderTarget} renderTarget  需要设置的 RenderTarget 对象
   * @param {number} faceIndex - gl.TEXTURE_CUBE_MAP_POSITIVE_X + faceIndex
   * */
  setRenderTargetFace(renderTarget: RenderTarget, faceIndex: number) {
    if (renderTarget) {
      const glRenderTarget = this._assetsCache.requireObject(renderTarget, GLRenderTarget);
      glRenderTarget.setRenderTargetFace(faceIndex);
    }
  }

  /**
   * 在一帧结束时，处理内部状态，释放 texture 缓存
   */
  endFrame() {
    const CHECK_FREQ = 8;
    if (this._frameCount % CHECK_FREQ === 0) {
      this._assetsCache.compact();
    }
  }

  /**
   * 释放资源
   */
  destroy() {
    this._assetsCache.finalize();
  }
}
