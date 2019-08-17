import { Logger } from '@alipay/o3-base';
import { Texture2D } from '@alipay/o3-material';

/**
 * Sprite数据对象
 * @class
 */
export class Sprite {

  private _texture;

  private _rect;

  private _anchor;

  private _uvRect;

  private _worldSize;
  /**
   * 纹理区域
   * @typedef {Object} Rect
   * @param {float} x 横向偏移量
   * @param {float} y 纵向偏移量
   * @param {float} width   宽度
   * @param {float} height  高度
   */

  /**
   * 构造函数
   * @param {Texture2D} texture 纹理对象
   * @param {Rect} rect 在纹理上面的像素区域
   * @param {vec2} anchor 锚点设置
   */
  constructor(texture, rect, anchor) {

    this._texture = texture;
    this._rect = rect || { x: 0, y: 0, width: texture.image.width, height: texture.image.height };
    this._anchor = anchor || [0.5, 0.5];

    const w = this._texture.image ? this._texture.image.width : this._rect.width;
    const h = this._texture.image ? this._texture.image.height : this._rect.height;

    this._uvRect = {
      u: this._rect.x / w,
      v: this._rect.y / h,
      width: w / this._rect.width,
      height: h / this._rect.height,
    };

    this._worldSize = [this._rect.width / 100, this._rect.height / 100];

  }

  /**
   * 在Texture上面的像素区域
   * @member {Rect}
   * @readonly
   */
  get spriteRect() {

    return this._rect;

  }

  /**
   * uv区域
   * @member {Rect}
   * @readonly
   */
  get uvRect() {

    return this._uvRect;

  }

  /**
   * 纹理对象
   * @member {Texture2D}
   * @readonly
   */
  get texture() {

    return this._texture;

  }

  /**
   * 锚点位置
   * @member {vec2}
   * @readonly
   */
  get anchor() {

    return this._anchor;

  }

  /**
   * 世界空间中大小
   * @member {vec2}
   * @readonly
   */
  get worldSize() {

    return this._worldSize;

  }

  /**
   * 通过Image创建Sprite
   * @param {string} name 名称
   * @param {Image} image
   * @param {Object} 创建Texture2D需要的配置
   * @param {Rect} rect 纹理区域
   * @param {vec2} anchor 锚点位置
   */
  static createFromImage(name, image, config, rect, anchor) {

    if (!image) {

      Logger.error('No image!');
      return false;

    }
    const texture = new Texture2D(name, image, config);
    rect = rect || { x: 0, y: 0, width: image.width, height: image.height };
    anchor = anchor || [0.5, 0.5];

    return new Sprite(texture, rect, anchor);

  }

}
