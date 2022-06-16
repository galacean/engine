import { Rect } from "@oasis-engine/math";
import { Engine } from "../../Engine";
import { Texture2D } from "../../texture/Texture2D";
import { Sprite } from "../sprite/Sprite";

/**
 * Dynamic atlas for text.
 */
export class DynamicTextAtlas {
  private static _region: Rect = new Rect();

  private _texture: Texture2D;
  private _width: number;
  private _height: number;

  private _space: number = 1;
  private _curX: number = 1;
  private _curY: number = 1;
  private _nextY: number = 1;

  private _sprites: Record<number, Sprite> = {};

  constructor(engine: Engine, width: number, height: number) {
    this._width = width;
    this._height = height;
    this._texture = new Texture2D(engine, width, height);
    this._texture._addRefCount(1);
  }

  /**
   * Destroy atlas, it will release the texture.
   */
  public destroy() {
    this._sprites = {};
    this._texture.destroy(true);
  }

  /**
   * Add a sprite.
   * @param sprite - the sprite to add
   * @param imageSource - The source of texture
   * @returns true if add sprite success, otherwise false
   */
  public addSprite(sprite: Sprite, imageSource: TexImageSource | OffscreenCanvas): boolean {
    const { _space: space, _texture: texture } = this;
    const { width, height } = imageSource;

    const offsetWidth = width + space;
    const endX = this._curX + offsetWidth;
    if (endX >= this._width) {
      this._curX = space;
      this._curY = this._nextY + space;
    }

    const endY = this._curY + height + space;
    if (endY > this._nextY) {
      this._nextY = endY;
    }

    if (this._nextY >= this._height) {
      return false;
    }

    texture.setImageSource(imageSource, 0, false, false, this._curX, this._curY);
    texture.generateMipmaps();

    const { _width, _height } = this;
    const region = DynamicTextAtlas._region;
    region.setValue(this._curX / _width, this._curY / _height, width / _width, height / _height);

    // destroy origin texture.
    sprite.texture && sprite.texture.destroy();
    // Update atlas texture.
    sprite.atlasRegion = region;
    sprite.texture = texture;
    this._curX += offsetWidth + space;

    return true;
  }

  /**
   * Remove a sprite.
   * @param sprite - the sprite to remove
   * @returns true if remove sprite success, otherwise false
   */
  public removeSprite(sprite: Sprite): boolean {
    const id = sprite.instanceId;
    const { _sprites } = this;
    if (_sprites[id]) {
      delete _sprites[id];
      return true;
    }
    return false;
  }
}

