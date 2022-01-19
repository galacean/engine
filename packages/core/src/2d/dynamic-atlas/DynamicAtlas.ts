import { Rect } from "@oasis-engine/math";
import { Engine } from "../../Engine";
import { Texture2D } from "../../texture/Texture2D";
import { Sprite } from "../sprite/Sprite";

/**
 * Dynamic atlas for text.
 */
export class DynamicAtlas {
  private static _rect: Rect = new Rect();

  private _texture: Texture2D;
  private _width: number;
  private _height: number;

  private _space: number = 1;
  private _curX: number = 1;
  private _curY: number = 1;
  private _nextY: number = 1;

  constructor(engine: Engine, width: number, height: number) {
    this._width = width;
    this._height = height;
    this._texture = new Texture2D(engine, width, height);
  }

  public destroy() {
    this._texture.destroy();
  }

  public addSprite(sprite: Sprite, imageSource: TexImageSource): boolean {
    const { _space: space, _texture: texture } = this;
    const { width, height } = imageSource;

    const endX = this._curX + width + space;
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

    const { _width, _height } = this;
    const rect = DynamicAtlas._rect;
    rect.setValue(this._curX / _width, this._curY / _height, width / _width, height / _height);
    sprite.atlasRegion = rect;
    sprite.texture = texture;
    this._curX = endX + space;

    return true;
  }
}
