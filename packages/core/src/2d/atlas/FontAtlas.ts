import { RefObject } from "../../asset/RefObject";
import { Engine } from "../../Engine";
import { Texture2D } from "../../texture/Texture2D";
import { CharInfo } from "../assembler/CharInfo";

/**
 * @internal
 * Font Atlas.
 */
export class FontAtlas extends RefObject {
  private _charInfoMap: Record<number, CharInfo> = {};
  private _texture: Texture2D;
  private _space: number = 1;
  private _curX: number = 1;
  private _curY: number = 1;
  private _nextY: number = 1;

  get texture(): Texture2D {
    return this._texture;
  }

  set texture(value: Texture2D) {
    this._texture = value;
  }

  /**
   * Constructor a FontAtlas.
   * @param engine - Engine to which the FontAtlas belongs
   */
  constructor(engine: Engine) {
    super(engine);
  }

  /**
   * @override
   */
  _onDestroy(): void {
    this._texture.destroy();
    this._texture = null;
    this._charInfoMap = {};
  }

  addCharInfo(
    id: number,
    imageSource: TexImageSource | OffscreenCanvas,
    width: number,
    height: number,
    offsetX: number,
    offsetY: number,
    xAdvance: number,
    ascent: number,
    descent: number,
  ): CharInfo {
    const { _space: space, texture } = this;
    const textureSize = texture.width;
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
    const charInfo = { x, y, w, h, offsetX, offsetY, xAdvance, u0, v0, u1, v1, ascent, descent };
    this._charInfoMap[id] = charInfo;
    this._curX += offsetWidth + space;
    return charInfo;
  }

  getCharInfo(id: number): CharInfo {
    return this._charInfoMap[id];
  }
}
