import { Texture2D } from "@alipay/o3-core";
import { Logger, Util } from "@alipay/o3-core";

/**
 * HUD贴图对象，内置一个2D的Canvas
 * @extends Texture2D
 * @private
 */
export class HUDTexture extends Texture2D {
  private _canvas;
  private _resetWholeTexture;
  private _maxTexSubWidth;
  private _maxTexSubHeight;
  public context;
  public isAndroid;

  /**
   * 构造函数
   * @param {string} name 纹理名称
   * @param {number} width 内部Canvas的宽度
   * @param {number} height 内部Canvas的高度
   */
  constructor(width: number, height: number) {
    super(width, height);

    //-- 创建2D绘制相关对象
    this._canvas = document.createElement("canvas");
    this._canvas.width = width;
    this._canvas.height = height;

    this.context = this._canvas.getContext("2d");

    this._resetWholeTexture = true;
    //-- 限制刷新canvas区域的大小，保证用来刷新的内存最大不超过1M
    this._maxTexSubWidth = Math.min(1, 512 / width);
    this._maxTexSubHeight = Math.min(1, 512 / height);

    //--
    const u = window.navigator.userAgent;
    this.isAndroid = u.indexOf("Android") > -1 || u.indexOf("Linux") > -1;
  }

  /**
   * 内置canvas
   * @member
   */
  get canvas() {
    return this._canvas;
  }

  /**
   * 刷新指定区域的纹理
   * @param {Object} gl
   * @param {Array} dirtyRects 需要刷新的区域
   */
  updateDirtyRects(dirtyRects) {
    if (dirtyRects.length === 0) {
      return;
    }

    if (this.isAndroid) {
      this._resetWholeTexture = true;
    }

    if (this._resetWholeTexture) {
      this.setImageSource(null);
      this._resetWholeTexture = false;
    } else {
      // 刷新子区域
      const subRects = this._getMergedTexSubRects(dirtyRects);
      for (let i = 0, size = subRects.length; i < size; i++) {
        const x = subRects[i].x;
        const y = subRects[i].y;
        const w = subRects[i].width;
        const h = subRects[i].height;
        this.setPixelBuffer(null, x, y, w, h);
      }
    }
  }

  /**
   * 清空指定区域的纹理
   * @param {Object} rect
   */
  clearRect(rect) {
    if (rect) {
      const x = rect.x;
      const y = rect.y;
      const w = rect.width;
      const h = rect.height;
      this.context.clearRect(x, y, w, h);
      this.setPixelBuffer(null, 0, x, y, w, h);
    }
  }

  /**
   * 取得合并后的需要刷新的区域
   * @param {Array} dirtyRects
   * @private
   */
  _getMergedTexSubRects(dirtyRects) {
    if (dirtyRects.length === 1) {
      return [dirtyRects[0]];
    }

    const textSubRects = [];

    for (let i = 0, size = dirtyRects.length; i < size; i++) {
      const dirtyRect = dirtyRects[i];
      let isMerged = false;
      for (let j = 0, size = textSubRects.length; j < size; j++) {
        if (this._tryToMergeRect(textSubRects[j], dirtyRect)) {
          isMerged = true;
          break;
        }
      }

      if (!isMerged) {
        textSubRects.push(Util.clone(dirtyRect));
      }
    }

    return textSubRects;
  }

  /**
   * 尝试将需要刷新的区域dirtyRect合并到目标区域subRect
   * @param {Object} textSubRect
   * @param {Object} dirtyRect
   * @private
   */
  _tryToMergeRect(textSubRect, dirtyRect) {
    const left = Math.min(textSubRect.x, dirtyRect.x);
    const bottom = Math.min(textSubRect.y, dirtyRect.y);
    const right = Math.max(textSubRect.x + textSubRect.width, dirtyRect.x + dirtyRect.width);
    const top = Math.max(textSubRect.y + textSubRect.height, dirtyRect.y + dirtyRect.height);

    if (right - left <= this._maxTexSubWidth && top - bottom <= this._maxTexSubHeight) {
      textSubRect.x = Math.max(0, left);
      textSubRect.y = Math.max(0, bottom);
      textSubRect.width = Math.min(this._canvas.width, right - left);
      textSubRect.height = Math.min(this._canvas.width, top - bottom);
      return true;
    }
    return false;
  }
}
