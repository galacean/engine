import { SceneFeature } from "@alipay/o3-core";
import { Logger } from "@alipay/o3-base";
import { HUDTextureMapper } from "./HUDTextureMapper";
import { HUDTexture } from "./HUDTexture";

/**
 * 判断场景中是否有灯光
 * @returns {boolean}
 * @private
 */
export function hasHUDWidget() {
  return this.findFeature(HUDFeature)._widgets.length > 0;
}

/**
 * HUD Feature：场景中HUD特性
 * @extends SceneFeature
 */
export class HUDFeature extends SceneFeature {
  private _widgets;
  private _dirtyRects;
  private _texture;
  private _textureMapper;

  constructor() {
    super();

    this._widgets = [];
    this._dirtyRects = [];
  }

  initTexture(width?, height?) {
    width = width || 512;
    height = height || 512;

    //-- HUD控件绘制的所需纹理，内置一个Canvas
    this._texture = new HUDTexture(width, height);
    //-- 负责给HUD控件分配Texture空间
    this._textureMapper = new HUDTextureMapper(width, height);
  }

  /**
   * 向当前场景注册一个HUD控件
   * @param {AHUDWidget} widget HUD控件
   * @private
   */
  attachWidget(widget) {
    if (!this._texture) {
      this.initTexture();
    }

    const index = this._widgets.indexOf(widget);
    if (index === -1) {
      this._widgets.push(widget);
      this._textureMapper.needAllocSprite(widget);
    } else {
      Logger.warn("Widget already attached.");
    }
  }

  /**
   * 从当前场景移除一个HUD控件
   * @param {AHUDWidget} widget HUD控件
   * @private
   */
  detachWidget(widget) {
    const index = this._widgets.indexOf(widget);
    if (index !== -1) {
      this._widgets.splice(index, 1);
    }
  }

  /**
   * 释放一个控件在Canvas占用的区域
   * @param {AHUDWidget} widget
   */
  releaseWidget(widget) {
    if (!this._textureMapper) {
      return;
    }

    const rect = this._textureMapper.releaseSprite(widget.spriteID);
    if (rect) {
      this._texture.clearRect(rect);
    }
  }

  /**
   * 添加需要刷新的HUDTexture区域
   * @param {Rect} rect
   */
  addDirtyRect(rect) {
    this._dirtyRects.push(rect);
  }

  /**
   * 2D绘图的Context对象，控件使用这个对象的接口来更新自己的内容（绘制到内部Canvas）
   * @member {Context}
   * @readonly
   */
  get context2D() {
    return this._texture.context;
  }

  /**
   * 获取内部Canvas绑定的Texture Altas对象
   * @member {HUDTexture}
   * @readonly
   */
  get texture() {
    return this._texture;
  }

  /**
   * 场景 Update 之前的回调
   * @param {Scene} scene
   */
  preUpdate(scene) {
    if (!this._texture) {
      this.initTexture();
    }

    //-- 给HUD控件分配Canvas区域
    this._textureMapper.allocSprites();
  }

  /**
   * 场景渲染前的回调
   * @param {Scene} scene
   * @param {ACamera} camera
   */
  preRender(scene, camera) {
    //-- update texture
    if (this._dirtyRects.length > 0) {
      this._texture.updateDirtyRects(this._dirtyRects);
      this._dirtyRects = [];
    }
  }
}
