import { Rect } from "@oasis-engine/math";
import { Engine } from "../../Engine";
import { Texture2D } from "../../texture/Texture2D";
import { Sprite } from "../sprite/Sprite";
import { OriginInfo, OriginInfoObj } from "./types";

/**
 * Dynamic atlas for text.
 */
export class DynamicAtlas {
  private static _region: Rect = new Rect();

  private _texture: Texture2D;
  private _width: number;
  private _height: number;

  private _space: number = 1;
  private _curX: number = 1;
  private _curY: number = 1;
  private _nextY: number = 1;

  private _originInfos: OriginInfoObj = {}; 

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
    const { _originInfos } = this;
    const ids = Object.keys(_originInfos);
    for (let i = 0, l = ids.length; i < l; ++i) {
      const id = ids[i];
      const info = <OriginInfo>_originInfos[id];
      const originSprite = info.sprite;
      originSprite.texture = info.texture;
      originSprite.atlasRegion = info.atlasRegion;
      delete _originInfos[id];
    }

    this._texture.destroy(true);
  }

  /**
   * Add a sprite.
   * @param sprite - the sprite to add
   * @param imageSource - The source of texture
   * @returns true if add sprite success, otherwise false
   */
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
    texture.generateMipmaps();

    const { _width, _height } = this;
    const region = DynamicAtlas._region;
    region.setValue(this._curX / _width, this._curY / _height, width / _width, height / _height);

    // Cache origin texture.
    const originTexture = sprite.texture;
    const id = sprite.instanceId;
    const { _originInfos } = this;
    const originInfo = _originInfos[id];
    if (originInfo) {
      originInfo.sprite = sprite;
      originInfo.texture = originTexture;
      originInfo.atlasRegion = sprite.atlasRegion.clone();
    } else {
      _originInfos[id] = {
        sprite: sprite,
        texture: originTexture,
        atlasRegion: sprite.atlasRegion.clone()
      };
    }

    // Update atlas texture.
    sprite.atlasRegion = region;
    sprite.texture = texture;
    this._curX = endX + space;

    return true;
  }

  /**
   * Remove a sprite.
   * @param sprite - the sprite to remove
   */
  public removeSprite(sprite: Sprite) {
    const id = sprite.instanceId;
    const { _originInfos } = this;
    const info = _originInfos[id];
    if (info) {
      const texture = info.texture;
      texture.destroy();
    }
    delete _originInfos[id];
  }

  /**
   * The origin texture before batch for the sprite.
   * @param id - the id of the sprite
   * @returns the origin texture before batch if have, otherwise null
   */
  public getOriginTextureById(id: number): Texture2D | null {
    const info = this._originInfos[id];
    if (info) {
      return info.texture;
    }
    return null;
  }
}
