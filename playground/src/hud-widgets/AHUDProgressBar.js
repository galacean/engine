import {
  AHUDWidget
} from '@alipay/o3-hud';

/**
 * 进度条控件
 */
export class AHUDProgressBar extends AHUDWidget {
  /**
   * @constructor
   * @param {Node} node
   * @param {Object} props 参数对象
   * @param {string} props.spriteID 控件在HUDRenderer中使用的Sprite ID，如果Sprite ID相同的话，则会共享Canvas中的同一区域
   * @param {vec2} props.textureSize 在内置Canvas上的纹理大小
   * @param {Image} props.bgImage 进度条的背景图片
   * @param {Image} props.fgImage 进度条的前景图片
   */
  constructor(node, props) {
    super(node, props);

    this._bgImage = props.bgImage;
    this._fgImage = props.fgImage;

    this._range = [0, 100];
    this._value = 0;

    this._text = '';
    this._font = '48px monospace';
    this._textFillStyle = 'white';
  }

  /**

   */
  initialize(hudRenderer, spriteID, bgImage, fgImage, screenSize, textureSize) {
    super.initialize(hudRenderer, spriteID);

    this._bgImage = bgImage;
    this._fgImage = fgImage;

    this._spriteRect.width = textureSize[0];
    this._spriteRect.height = textureSize[1];

    this._range = [0, 100];
    this._value = 0;

    this._text = '';
    this._font = '48px monospace';
    this._textFillStyle = 'white';
  }

  get text() {
    return this._text;
  }
  set text(val) {
    this._text = val;
    this._canvasDirty = true;
  }

  get font() {
    return this._font;
  }
  set font(val) {
    this._font = val;
    this._canvasDirty = true;
  }

  /**
   * 进度条的取值范围
   * @param {Number} minValue 最小值
   * @param {Number} maxValue 最大值
   */
  setRange(minValue, maxValue) {
    this._range = [minValue, maxValue];
    this._canvasDirty = true;
    this.currentValue = this._value;
  }

  /**
   * 进度条的当前值
   */
  get currentValue() {
    return this._value;
  }
  set currentValue(val) {
    this._value = val;
    if (this._value < this._range[0])
      this._value = this._range[0];
    if (this._value > this._range[1])
      this._value = this._range[1];
    this._canvasDirty = true;
  }

  update(deltaTime) {
    super.update(deltaTime);
    if (this.autoUpdate) {
      this.currentValue = this.currentValue >= 19 ? 0 : this.currentValue + 1;
    }

  }

  /**
   * 将当期进度条状态绘制到Canvas 2D上
   * @param {CanvasRenderingContext2D} ctx2d
   */
  drawWidget(ctx2d) {
    super.drawWidget(ctx2d);

    let x = this._spriteRect.x;
    let y = this._spriteRect.y;

    // // 画出背景图片
    ctx2d.drawImage(this._bgImage, x, y);

    // 画出前景图片
    let r = (this._value - this._range[0]) / (this._range[1] - this._range[0]);
    if (r > 0) {
      let w = this._spriteRect.width * r;
      let h = this._spriteRect.height;
      ctx2d.drawImage(this._fgImage, 0, 0, w, h, x, y, w, h);
    }

    // 画出文字
    if (this._text && this._text.length > 0) {
      ctx2d.font = this._font;
      ctx2d.textAlign = 'center';
      ctx2d.textBaseline = 'middle';

      let w = this._spriteRect.width;
      let h = this._spriteRect.height;

      ctx2d.lineWidth = 3;

      ctx2d.strokeStyle = '#552F17';
      ctx2d.fillStyle = this._textFillStyle;

      ctx2d.strokeText(this._text, x + w / 2, y + h / 2, w);
      ctx2d.fillText(this._text, x + w / 2, y + h / 2, w);
    }
  }
}

