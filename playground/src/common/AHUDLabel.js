'use strict';

import {
  AHUDWidget
} from '@alipay/o3-hud';

export class AHUDLabel extends AHUDWidget {

  /**
   * @constructor
   * @param {Node} node
   * @param {Object} props 参数对象
   * @param {string} props.spriteID 控件在HUDRenderer中使用的Sprite ID，如果Sprite ID相同的话，则会共享Canvas中的同一区域
   */
  constructor(node, props) {
    super(node, props);

    this._text = ' ';

    this._backgroundStyle = 'rgba(0, 0, 0, 0)';
    this._font = '40px monospace';
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

  get backgroundStyle() {
    return this._backgroundStyle;
  }
  set backgroundStyle(val) {
    this._backgroundStyle = val;
    this._canvasDirty = true;
  }

  drawWidget(ctx2d) {
    super.drawWidget(ctx2d);

    ctx2d.fillStyle = this._backgroundStyle;
    let x = this._spriteRect.x;
    let y = this._spriteRect.y;
    let w = this._spriteRect.width;
    let h = this._spriteRect.height;
    ctx2d.fillRect(x, y, w, h);

    ctx2d.font = this._font;
    ctx2d.fillStyle = 'white';
    ctx2d.textAlign = 'center';
    ctx2d.textBaseline = 'middle';
    ctx2d.fillText(this._text, x + w / 2, y + h / 2, w);
  }
};
