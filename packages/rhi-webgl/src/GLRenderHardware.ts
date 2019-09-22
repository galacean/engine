import { Logger, ClearMode } from '@alipay/o3-base';
import { GLRenderStates } from './GLRenderStates';
import { GLAssetsCache } from './GLAssetsCache';
import { GLPrimitive } from './GLPrimitive';
import { GLTechnique } from './GLTechnique';
import { GLSpriteBatcher } from './GLSpriteBatcher';
import { GLRenderTarget } from './GLRenderTarget';
import { GLExtensions } from './GLExtensions';
/**
 * GPU 硬件抽象层的 WebGL 1.0 版的实现
 * @private
*/
export class GLRenderHardware {

  private _canvas: HTMLCanvasElement;
  private _gl: WebGLRenderingContext;
  private _renderStates;
  private _assetsCache;
  private _extensions;
  private _frameCount: number;
  private _spriteBatcher;

  constructor(canvas: HTMLCanvasElement, attributes) {

    //-- get gl context
    if (typeof (canvas) === 'string') {

      this._canvas = document.getElementById(canvas) as HTMLCanvasElement;

    }
    else {

      this._canvas = canvas;

    }

    this._gl = (this._canvas.getContext('webgl', attributes) || this._canvas.getContext('experimental-webgl', attributes)) as WebGLRenderingContext;
    if (this._gl === null) {

      throw new Error('Get GL Context FAILED.');

    }

    //-- states
    this._renderStates = new GLRenderStates(this._gl);

    //--
    this._assetsCache = new GLAssetsCache(this, attributes);

    this._extensions = new GLExtensions(this);

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
  get assetsCache() {

    return this._assetsCache;

  }

  /**
   * GL 状态管理器
   */
  get renderStates(): GLRenderStates {

    return this._renderStates;

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
   * 设置视口区域
   * @param {number} x 用来设定视口的左下角水平坐标
   * @param {number} y 用来设定视口的左下角垂直坐标
   * @param {number} width 用来设定视口的宽度
   * @param {number} height 用来设定视口的高度
   */
  viewport(x, y, width, height) {

    this._gl.viewport(x, y, width, height);

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

    const glPrimitive = this._assetsCache.requireObject(primitive, GLPrimitive);
    const glTech = this._assetsCache.requireObject(mtl.technique, GLTechnique);

    if (glPrimitive && glTech) {

      glTech.begin(mtl);
      glPrimitive.draw(glTech);
      glTech.end();

    }
    else {

      Logger.error('draw primitive failed.');

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
   * @param {RenderTarget} renderTarget  需要被激活的RenderTarget对象，如果未设置，则
   */
  activeRenderTarget(renderTarget, camera) {

    if (renderTarget) {

      const glRenderTarget = this._assetsCache.requireObject(renderTarget, GLRenderTarget);
      glRenderTarget.activeRenderTarget();

    } else {

      const gl = this._gl;
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(camera.viewport[0], camera.viewport[1], camera.viewport[2], camera.viewport[3]);

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
