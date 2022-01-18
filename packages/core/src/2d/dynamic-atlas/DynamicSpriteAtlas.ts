import { Engine } from "../../Engine";
import { Texture2D } from "../../texture/Texture2D";
import { Sprite } from "../sprite/Sprite";
import { DynamicSprite } from "./types";

export class DynamicSpriteAtlas {
  private _texture: Texture2D;
  private _width: number;
  private _height: number;

  constructor(engine: Engine, width: number, height: number) {
    this._width = width;
    this._height = height;
    this._texture = new Texture2D(engine, width, height);
  }

  public addSprite(sprite: Sprite, imageSource: TexImageSource): DynamicSprite | null {

  }
}
