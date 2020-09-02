import { ClearMode, GLCapabilityType, Logger } from "@alipay/o3-core";
import { Camera, Canvas, HardwareRenderer } from "@alipay/o3-core";
import { RenderTarget } from "@alipay/o3-core";
import { GLAssetsCache } from "./GLAssetsCache";
import { GLCapability } from "./GLCapability";
import { GLExtensions } from "./GLExtensions";
import { GLPrimitive } from "./GLPrimitive";
import { GLRenderStates } from "./GLRenderStates";
import { GLRenderTarget } from "./GLRenderTarget";
import { GLSpriteBatcher } from "./GLSpriteBatcher";
import { GLTechnique } from "./GLTechnique";
import { GLVAOPrimitive } from "./GLVAOPrimitive";
import { WebGLExtension } from "./type";
import { WebCanvas } from "./WebCanvas";
import { Vector4 } from "@alipay/o3-math";

/**
 * WebGL模式。默认 Auto
 */
export enum WebGLMode {
  /** 自动，如果设备支持优先选择WebGL2.0，不支持 WebGL2.0 会回滚至WebGL1.0 */
  Auto = 0,
  /** 使用 WebGL2.0 */
  WebGL2 = 1,
  /** 使用 WebGL1.0 */
  WebGL1 = 2
}

/**
 * WebGLRenderer的参数选项。
 */
export interface WebGLRendererOptions extends WebGLContextAttributes {
  /** WebGL API 模式。*/
  webGLMode?: WebGLMode;
}

/**
 * WebGL渲染器实现，包含了WebGL1.0/和WebGL2.0。
 */
export class WebGLRenderer implements HardwareRenderer {
  private _options: WebGLRendererOptions;
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

  constructor(options: WebGLRendererOptions = {}) {
    this._options = options;
  }

  init(canvas: Canvas) {
    const option = this._options;
    const webCanvas = (canvas as WebCanvas)._webCanvas;
    const webGLMode = option.webGLMode || WebGLMode.Auto;
    let gl: (WebGLRenderingContext & WebGLExtension) | WebGL2RenderingContext;

    if (webGLMode == WebGLMode.Auto || webGLMode == WebGLMode.WebGL2) {
      gl = webCanvas.getContext("webgl2", option);
      if (!gl && webCanvas instanceof HTMLCanvasElement) {
        gl = <WebGL2RenderingContext>webCanvas.getContext("experimental-webgl2", option);
      }
      this._isWebGL2 = true;
    }

    if (!gl) {
      if (webGLMode == WebGLMode.Auto || webGLMode == WebGLMode.WebGL1) {
        gl = <WebGLRenderingContext & WebGLExtension>webCanvas.getContext("webgl", option);
        if (!gl && webCanvas instanceof HTMLCanvasElement) {
          gl = <WebGLRenderingContext & WebGLExtension>webCanvas.getContext("experimental-webgl", option);
        }
        this._isWebGL2 = false;
      }
    }

    if (!gl) {
      throw new Error("Get GL Context FAILED.");
    }

    this._gl = gl;
    this._renderStates = new GLRenderStates(gl);
    this._assetsCache = new GLAssetsCache(this, option);
    this._extensions = new GLExtensions(this);
    this._capability = new GLCapability(this);

    this._frameCount = 0;
    this._options = null;
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
  clearRenderTarget(clearMode, clearParam: Vector4) {
    const gl = this._gl;

    switch (clearMode) {
      case ClearMode.SOLID_COLOR: // solid color
        gl.clearColor(clearParam.x, clearParam.y, clearParam.z, clearParam.w);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
        break;
      case ClearMode.DEPTH_ONLY: // depth only
        gl.clear(gl.DEPTH_BUFFER_BIT);
        break;
      case ClearMode.COLOR_ONLY:
        gl.clearColor(clearParam.x, clearParam.y, clearParam.z, clearParam.w);
        gl.clear(gl.COLOR_BUFFER_BIT);
        break;
      case ClearMode.STENCIL_ONLY:
        gl.clear(gl.STENCIL_BUFFER_BIT);
        break;
      case ClearMode.ALL_CLEAR:
        gl.clearColor(clearParam.x, clearParam.y, clearParam.z, clearParam.w);
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
      GLPrimitive
      // this.canIUse(GLCapabilityType.vertexArrayObject) && !primitive.targets.length ? GLVAOPrimitive : GLPrimitive
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
   * @param {Camera}   camera        相机信息
   */
  drawSprite(positionQuad, uvRect, tintColor, texture, renderMode, camera: Camera) {
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
  activeRenderTarget(renderTarget: RenderTarget, camera: Camera) {
    if (renderTarget) {
      const glRenderTarget = this._assetsCache.requireObject(renderTarget, GLRenderTarget);
      glRenderTarget.activeRenderTarget();
    } else {
      const gl = this._gl;
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      const viewport = camera.viewport;
      const width = gl.drawingBufferWidth;
      const height = gl.drawingBufferHeight;
      this.viewport(viewport.x * width, viewport.y * height, viewport.z * width, viewport.w * height);
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
