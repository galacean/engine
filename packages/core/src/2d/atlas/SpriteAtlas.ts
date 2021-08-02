import { RefObject } from "../../asset/RefObject";
import { Engine } from "../../Engine";
import { Sprite } from "../sprite/Sprite";

/**
 * Sprite Atlas.
 */
export class SpriteAtlas extends RefObject {
  /** @internal */
  _sprites = new Array<Sprite>();
  /** @internal */
  _spriteNamesToIndex: Record<string, number> = {};

  /**
   * All the sprites in the atlas.
   */
  public get sprites(): Readonly<Sprite[]> {
    return this._sprites;
  }

  /**
   * Get the last sprite named 'name' from the atlas.
   * @param name - The name of the sprite you want to find
   * @returns The sprite you want to find
   */
  public getSprite(name: string): Sprite {
    const sprite = this._sprites[this._spriteNamesToIndex[name]];
    if (!sprite) {
      console.warn("There is no sprite named " + name + " in the atlas.");
    }
    return sprite;
  }

  /**
   * Get all the sprite named 'name' from the atlas.
   * @param name - The name of the sprites you want to find
   * @param outSprites - This array holds the sprites found
   * @returns The sprites you want to find
   */
  public getSprites(name: string, outSprites: Sprite[]): Sprite[] {
    if (name != null) {
      const { _sprites } = this;
      for (let index = this._spriteNamesToIndex[name]; index >= 0; index--) {
        const sprite = _sprites[index];
        sprite.name == name && outSprites.push(sprite);
      }
    } else {
      console.warn("The name of the sprite you want to find is null.");
    }
    return outSprites;
  }

  /**
   * Constructor a SpriteAtlas.
   * @param engine - Engine to which the SpriteAtlas belongs
   */
  constructor(engine: Engine) {
    super(engine);
  }

  /**
   * @internal
   */
  _registerSprite(sprite: Sprite) {
    this._spriteNamesToIndex[sprite.name] = this._sprites.push(sprite) - 1;
  }

  /**
   * @override
   */
  _onDestroy(): void {
    if (this._sprites) {
      this._sprites = null;
      this._spriteNamesToIndex = null;
    }
  }
}
