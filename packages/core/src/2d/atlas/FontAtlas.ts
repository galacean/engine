import { Vector2 } from "@galacean/engine-math";
import { Engine } from "../../Engine";
import { ReferResource } from "../../asset/ReferResource";
import { TextureFilterMode, TextureFormat } from "../../texture";
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
  private _preSize: number = 0;
  private _curSize: number = 128;

  constructor(engine: Engine) {
    super(engine);
    this.isGCIgnored = true;
    const size = this._curSize;
    const texture = new Texture2D(engine, size, size, TextureFormat.R8G8B8A8, false);
    texture.filterMode = TextureFilterMode.Bilinear;
    texture.isGCIgnored = true;
    this.texture = texture;
  }

  uploadCharTexture(charInfo: CharInfo): boolean {
    const { w: width, h: height, data } = charInfo;
    const { _space: space, texture } = this;
    const textureSize = texture.width;
    const offsetWidth = width + space;
    const offsetHeight = height + space;
    const tempCurX = this._curX;
    const tempNextY = this._nextY;

    const endX = tempCurX + offsetWidth;
    if (endX >= textureSize) {
      this._curX = space + (tempNextY > this._preSize ? 0 : this._preSize);
      this._curY = tempNextY + space;
    }
    const endY = this._curY + offsetHeight;
    if (endY > tempNextY) {
      this._nextY = endY;
    }
    // Exceed cur texture size.
    if (endY >= textureSize) {
      if (textureSize >= 1024) {
        console.warn("Exceed max size.");
        return false;
      } else {
        this._curX = textureSize + space;
        this._curY = space;
        this._nextY = space;
        this._resizeTexture();
        return this.uploadCharTexture(charInfo);
      }
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

  private _resizeTexture(): void {
    const curSize = (this._preSize = this._curSize);
    const newSize = (this._curSize *= 2);
    const resizeTexture = new Texture2D(this.engine, newSize, newSize, TextureFormat.R8G8B8A8, false);
    resizeTexture.filterMode = TextureFilterMode.Bilinear;
    resizeTexture.isGCIgnored = true;
    const texture = this.texture;
    this.texture = resizeTexture;

    // Write data from texture to resize texture.
    const data = new Uint8Array(curSize * curSize * 4);
    texture.getPixelBuffer(data);
    resizeTexture.setPixelBuffer(data, 0, 0, 0, curSize, curSize);
    resizeTexture.generateMipmaps();

    // Reset uvs
    const map = this._charInfoMap;
    for (const key in map) {
      const charInfo = map[key];
      const uvs = charInfo.uvs;
      uvs[0].scale(0.5);
      uvs[1].scale(0.5);
      uvs[2].scale(0.5);
      uvs[3].scale(0.5);
    }

    texture.destroy();
  }
}
