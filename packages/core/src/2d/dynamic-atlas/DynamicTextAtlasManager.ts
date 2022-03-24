import { Sprite } from "../sprite/Sprite";
import { Engine } from "../../Engine";
import { DynamicTextAtlas } from "./DynamicTextAtlas";

/**
 * Dynamic atlas manager for text.
 */
export class DynamicTextAtlasManager {
  private _maxAtlasCount: number = 2;
  private _textureSize: number = 1024;
  private _atlases: Array<DynamicTextAtlas> = [];
  private _atlasIndex: number = -1;
  private _spritesInAtlasIndex: Record<number, number> = {};

  /**
   * Indicates how many atlases should be created.
   */
  get maxAtlasCount(): number {
    return this._maxAtlasCount;
  }

  set maxAtlasCount(val: number) {
    this._maxAtlasCount = val;
  }

  /**
   * Indicates the size of the texture.
   */
  get textureSize(): number {
    return this._textureSize;
  }

  set textureSize(val: number) {
    this._textureSize = Math.min(val, 2048);
  }

  /**
   * @internal
   */
  constructor(public readonly engine: Engine) {}

  /**
   * Add a sprite to atlas.
   * @param sprite - the sprite to add
   * @param imageSource - The source of texture
   * @returns true if add sprite success, otherwise false
   */
  public addSprite(sprite: Sprite, imageSource: TexImageSource): boolean {
    if (this._atlasIndex >= this._maxAtlasCount) {
      return false;
    }

    // Remove sprite if the sprite has been add.
    const { _spritesInAtlasIndex, _atlases } = this;
    const id = sprite.instanceId;
    const atlasIndex = _spritesInAtlasIndex[id];
    if (atlasIndex) {
      _atlases[atlasIndex].removeSprite(sprite);
      delete _spritesInAtlasIndex[id];
    }

    let atlas = _atlases[this._atlasIndex];
    if (!atlas) {
      atlas = this._createAtlas();
    }

    if (atlas.addSprite(sprite, imageSource)) {
      _spritesInAtlasIndex[id] = this._atlasIndex;
      return true;
    }

    if (this._atlasIndex + 1 >= this._maxAtlasCount) {
      this._atlasIndex = this._maxAtlasCount;
      return false;
    }

    atlas = this._createAtlas();
    if (atlas.addSprite(sprite, imageSource)) {
      _spritesInAtlasIndex[id] = this._atlasIndex;
      return true;
    }
    return false;
  }

  /**
   * Remove a sprite from atlas.
   * @param sprite - the sprite to remove
   * @returns true if remove sprite success, otherwise false
   */
  public removeSprite(sprite: Sprite): boolean {
    if (!sprite) return false;

    const { _atlases } = this;
    for (let i = _atlases.length - 1; i >= 0; --i) {
      const atlas = _atlases[i];
      if(atlas.removeSprite(sprite)) {
        delete this._spritesInAtlasIndex[i];
        return true;
      }
    }

    return false;
  }

  /**
   * Reset all atlases.
   */
  public reset() {
    const { _atlases } = this;
    for (let i = 0, l = _atlases.length; i < l; ++i) {
      _atlases[i].destroy();
    }

    _atlases.length = 0;
    this._atlasIndex = -1;
    this._spritesInAtlasIndex = {};
  }

  private _createAtlas(): DynamicTextAtlas {
    this._atlasIndex++;
    const { _textureSize } = this;
    const atlas = new DynamicTextAtlas(this.engine, _textureSize, _textureSize);
    this._atlases.push(atlas);
    return atlas;
  }
}
