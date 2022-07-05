import { Engine } from "../../Engine";
import { Texture2D } from "../../texture";
import { CharDef, FontAtlas } from "./FontAtlas";

/**
 * @internal
 */
export class DynamicFontAtlas extends FontAtlas {
  private _textureSize: number = 512;
  private _space: number = 1;
  private _curX: number = 1;
  private _curY: number = 1;
  private _nextY: number = 1;

  constructor(engine: Engine) {
    super(engine);
    const { _textureSize } = this;
    this.texture = new Texture2D(engine, _textureSize, _textureSize);
  }

  addCharDefDynamic(
    id: number,
    imageSource: TexImageSource | OffscreenCanvas,
    width: number,
    height: number,
    offsetX: number,
    offsetY: number,
    xAdvance: number,
    ascent: number,
    descent: number,
  ): CharDef {
    const { _space: space, _textureSize: textureSize } = this;
    const offsetWidth = width + space;
    const offsetHeight = height + space;
    if ((1 + offsetWidth) >= textureSize || (1 + offsetHeight) >= textureSize) {
      throw Error("The char fontSize is too large.");
    }

    const endX = this._curX + offsetWidth;
    if (endX >= textureSize) {
      this._curX = space;
      this._curY = this._nextY + space;
    }
    const endY = this._curY + offsetHeight;
    if (endY > this._nextY) {
      this._nextY = endY;
    }
    if (endY >= textureSize) {
      return null;
    }

    if (width > 0 && height > 0) {
      const { texture } = this;
      texture.setImageSource(imageSource, 0, false, false,  this._curX, this._curY);
      texture.generateMipmaps();
    }

    const textureSizeReciprocal = 1.0 / textureSize;
    const x = this._curX;
    const y = this._curY;
    const w = width;
    const h = height;
    const u0 = x * textureSizeReciprocal;
    const u1 = (x + w) * textureSizeReciprocal;
    const v0 = y * textureSizeReciprocal;
    const v1 = (y + h) * textureSizeReciprocal;
    const charDef = { x, y, w, h, offsetX, offsetY, xAdvance, u0, v0, u1, v1, ascent, descent };
    this.addCharDef(id, charDef);
    this._curX += offsetWidth + space;
    return charDef;
  }
}

