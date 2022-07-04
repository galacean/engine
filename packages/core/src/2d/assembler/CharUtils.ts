import { Engine } from "../../Engine";
import { Texture2D } from "../../texture";
import { CharDef, FontAtlas } from "../atlas/FontAtlas";

/**
 * @internal
 */
export interface CharDefWithTexture {
  texture: Texture2D;
  charDef: CharDef;
}

/**
 * @internal
 */
export class CharUtils {
  private _fontAtlasList: Array<FontAtlas> = [];
  private _curFontAtlas: FontAtlas = null;
  private _textureSize: number = 512;
  private _space: number = 1;
  private _curX: number = 1;
  private _curY: number = 1;
  private _nextY: number = 1;

  /**
   * @internal
   */
  constructor(public readonly engine: Engine) {
    this._createFontAtlas();
  }

  addCharDef(
    key: string,
    imageSource: TexImageSource | OffscreenCanvas,
    width: number,
    height: number,
    offsetX: number,
    offsetY: number,
    xAdvance: number,
  ): CharDefWithTexture {
    const { _space: space, _textureSize: textureSize } = this;

    const offsetWidth = width + space;
    const endX = this._curX + offsetWidth;
    if (endX >= textureSize) {
      this._curX = space;
      this._curY = this._nextY + space;
    }
    const offsetHeight = height + space;
    const endY = this._curY + offsetHeight;
    if (endY > this._nextY) {
      this._nextY = endY;
    }

    if (endY >= textureSize) {
      this._createFontAtlas();
      this._curX = 1;
      this._curY = 1;
      this._nextY = 1;
      if (this._curX + offsetWidth >= textureSize || this._curY + offsetHeight >= textureSize) {
        throw Error("The char fontSize is too large.");
      }
    }

    const curTexture = this._curFontAtlas.getTexture();
    if (width > 0 && height > 0) {
      curTexture.setImageSource(imageSource, 0, false, false,  this._curX, this._curY);
      curTexture.generateMipmaps();
    }
    
    const textureSizeReciprocal = 1.0 / curTexture.width;
    const x = this._curX;
    const y = this._curY;
    const w = width;
    const h = height;
    const u0 = x * textureSizeReciprocal;
    const u1 = (x + w) * textureSizeReciprocal;
    const v0 = y * textureSizeReciprocal;
    const v1 = (y + h) * textureSizeReciprocal;
    const charDef = { x, y, w, h, offsetX, offsetY, xAdvance, u0, v0, u1, v1 };
    this._curFontAtlas.addCharDef(key, charDef);
    this._curX += offsetWidth + space;

    return {
      texture: curTexture,
      charDef
    };
  }

  getCharDef(key: string): CharDefWithTexture {
    const { _fontAtlasList } = this;
    for (let i = 0, l = _fontAtlasList.length; i < l; ++i) {
      const fontAtlas = _fontAtlasList[i];
      const charDef = fontAtlas.getCharDef(key);
      if (charDef) {
        return {
          texture: fontAtlas.getTexture(),
          charDef: charDef
        };
      }
    }
    return null;
  }

  clear(): void {
    this._curFontAtlas = null;
    const { _fontAtlasList } = this;
    for (let i = 0, l = _fontAtlasList.length; i < l; ++i) {
      const fontAtlas = _fontAtlasList[i];
      fontAtlas.destroy();
    }
    _fontAtlasList.length = 0;
  }

  private _createFontAtlas(): void {
    const { engine, _textureSize } = this;
    const tex = new Texture2D(engine, _textureSize, _textureSize);
    tex._addRefCount(1);
    this._curFontAtlas = new FontAtlas(engine, tex);
    this._fontAtlasList.push(this._curFontAtlas);
  }
}
