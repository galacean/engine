import { NodeAbility } from "@alipay/o3-core";
import { Logger } from "@alipay/o3-base";
/**
 * 指定范围内的往返运动
 */
export class AFade extends NodeAbility {

  constructor(node) {
    super(node);

    this._duration = 0;
    this._isFadeIn = false;
    this._widget = null;
  }

  setFade(widget, duration, colorIdx) {
    if (!widget) {
      Logger.error('Widget should not be null!');
      return;
    }

    if (duration <= 0) {
      Logger.error('Duration error!');
      return;
    }
    this._widget = widget;
    this._duration = duration;
    this._deltaTime = 0;
    this._colorIdx = colorIdx || 3;
  }

  update(deltaTime) {

    this._deltaTime += this._isFadeIn ? deltaTime : (-deltaTime);
    if (this._deltaTime < 0) {
      this._deltaTime = 0;
      this._isFadeIn = true;
    } else if (this._deltaTime > this._duration) {
      this._deltaTime = this._duration;
      this._isFadeIn = false;
    }

    let p = this._deltaTime/this._duration;
    let color = [1, 1, 1, 1];
    color[this._colorIdx] = p;
    this._widget.tintColor = color;
  }
}

