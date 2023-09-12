import { Vector2 } from "@galacean/engine-math";
import { Engine } from "../../Engine";
import { ReferResource } from "../../asset/ReferResource";
import { Texture2D } from "../../texture/Texture2D";
import { CharInfo } from "../text/CharInfo";

/**
 * @internal
 */
export class FontAtlas extends ReferResource {
  texture: Texture2D;

  _charInfoMap: Record<number, CharInfo> = {};
  private _space: number = 1;
  private _curX: number = 1;
  private _curY: number = 1;
  private _nextY: number = 1;

  constructor(engine: Engine) {
    super(engine);
  }

  uploadCharTexture(charInfo: CharInfo): boolean {
    const { w: width, h: height, data } = charInfo;
    const { _space: space, texture } = this;
    const textureSize = texture.width;
    const offsetWidth = width + space;
    const offsetHeight = height + space;
    if (1 + offsetWidth >= textureSize || 1 + offsetHeight >= textureSize) {
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
      return false;
    }

    if (width > 0 && height > 0 && data) {
      charInfo.bufferOffset = new Vector2(this._curX, this._curY);
      texture.setPixelBuffer(data, 0, this._curX, this._curY, width, height);
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

    charInfo.x = x;
    charInfo.y = y;
    const uvs = charInfo.uvs;
    uvs[0].set(u0, v0);
    uvs[1].set(u1, v0);
    uvs[2].set(u1, v1);
    uvs[3].set(u0, v1);

    this._curX += offsetWidth + space;
    return true;
  }

  addCharInfo(char: string, charInfo: CharInfo) {
    this._charInfoMap[char.charCodeAt(0)] = charInfo;
  }

  getCharInfo(char: string): CharInfo {
    return this._charInfoMap[char.charCodeAt(0)];
  }

  /**
   * @internal
   */
  protected override _onDestroy(): void {
    super._onDestroy();
    this.texture.destroy();
    this.texture = null;
    this._charInfoMap = {};
  }
}
