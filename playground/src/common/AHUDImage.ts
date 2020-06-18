"use strict";

import { AHUDWidget } from "@alipay/o3-hud";

/**
 * 进度条控件
 */
export class AHUDImage extends AHUDWidget {
  public _image: any;

  /**
   * @constructor
   * @param {Node} node
   * @param {Object} props 参数对象
   * @param {Image} props.image Image对象
   */
  constructor(node, props) {
    super(node, props);

    this._image = props.image;
  }

  /**
   * 将当期进度条状态绘制到Canvas 2D上
   * @param {CanvasRenderingContext2D} ctx2d
   */
  drawWidget(ctx2d) {
    super.drawWidget(ctx2d);

    ctx2d.fillStyle = "rgba(0, 0, 0, 0)";
    let x = this._spriteRect.x;
    let y = this._spriteRect.y;
    let w = this._spriteRect.width;
    let h = this._spriteRect.height;
    ctx2d.fillRect(x, y, w, h);

    //
    ctx2d.drawImage(this._image, x, y);
  }
}
