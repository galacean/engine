import { Sprite } from "../sprite/Sprite";
import { Engine } from "../../Engine";
import { DynamicSpriteAtlas } from "./DynamicSpriteAtlas";
import { DynamicSprite } from "./types";

/**
 * Dynamic atlas manager for text.
 */
export class DynamicAtlasManager {
  private _enabled: boolean = false;
  private _maxAtlasCount: number = 2;
  private _textureSize: number = 2048;
  private _atlases: Array<DynamicSpriteAtlas> = [];
  private _atlasIndex: number = -1;

  /**
   * Indicates whether the manager is enabled.
   */
  get enabled(): boolean {
    return this._enabled;
  }

  set enabled(val: boolean) {
    if (this._enabled !== val) {
      this._enabled = val;
      this.reset();
    }
  }

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

  public addSprite(sprite: Sprite, imageSource: TexImageSource): DynamicSprite | null {
    if (!this._enabled || this._atlasIndex >= this._maxAtlasCount) {
      return null;
    }

    const texture = sprite.texture;
    const id = texture.instanceId;
    let atlas = this._atlases[this._atlasIndex];
    if (!atlas) {
      atlas = this._createAtlas();
    }

    const dynamicSprite = atlas.addSprite(sprite, imageSource);
    if (!dynamicSprite) {
      if (this._atlasIndex + 1 >= this._maxAtlasCount) {
        this._atlasIndex = this._maxAtlasCount;
        return null;
      }
      atlas = this._createAtlas();
      return atlas.addSprite(sprite, imageSource);
    }

    return dynamicSprite;
  }

  public reset() {}

  private _createAtlas(): DynamicSpriteAtlas {
    this._atlasIndex++;
    const { _textureSize } = this;
    const atlas = new DynamicSpriteAtlas(this.engine, _textureSize, _textureSize);
    this._atlases.push(atlas);
    return atlas;
  }
}
