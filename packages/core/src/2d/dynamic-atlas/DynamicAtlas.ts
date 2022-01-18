import { Vector2 } from "@oasis-engine/math";
import { Engine } from "../../Engine";
import { Texture2D } from "../../texture/Texture2D";
import { Sprite } from "../sprite/Sprite";
import { DynamicSprite } from "./types";

/**
 * Dynamic atlas for text.
 */
export class DynamicAtlas {
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

  }

  public addSprite(sprite: Sprite, imageSource: TexImageSource): DynamicSprite | null {
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
      return null;
    }

    texture.setImageSource(imageSource, 0, false, false, this._curX, this._curY);

    const { _width, _height } = this;
    const l = this._curX / _width;
    const r = (this._curX + width) / _width;
    const t = this._curY / _height;
    const b = (this._curY + height) / _height;
    const dynamicSprite: DynamicSprite = {
      _uv: [
        new Vector2(l, t),
        new Vector2(r, t),
        new Vector2(r, b),
        new Vector2(l, b)
      ],
      texture
    }
    this._curX = endX + space;
    return dynamicSprite;
  }
}
