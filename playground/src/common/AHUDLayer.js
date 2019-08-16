'use strict';

import {
  AHUDWidget
} from '@alipay/r3-hud';

export class AHUDLayer extends AHUDWidget {

  /**
   * @constructor
   * @param {Node} node
   * @param {Object} props 参数对象
   * @param {Image} props.backgroundStyle 背景颜色设置
   */
  constructor(node, props) {
    super(node, props);

    this._backgroundStyle = props.backgroundStyle;
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
  }
};
