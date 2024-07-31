import { ReferResource } from "../../asset/ReferResource";
import { Engine } from "../../Engine";
import { Sprite } from "../sprite/Sprite";

/**
 * Sprite Atlas.
 */
export class SpriteAtlas extends ReferResource {
  private _sprites: Sprite[] = new Array<Sprite>();
  private _spriteNamesToIndex: Record<string, number> = {};

  /**
   * All the sprites in the atlas.
   */
  get sprites(): Readonly<Sprite[]> {
    return this._sprites;
  }

  /**
   * Get the last sprite named 'name' from the atlas.
   * @param name - The name of the sprite you want to find
   * @returns The sprite you want to find
   */
  getSprite(name: string): Sprite {
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
  getSprites(name: string, outSprites: Sprite[]): Sprite[] {
    outSprites.length = 0;
    let i = this._spriteNamesToIndex[name];
    if (i !== undefined) {
      const { _sprites } = this;
      for (; i >= 0; i--) {
        const sprite = _sprites[i];
        sprite.name === name && outSprites.push(sprite);
      }
    } else {
      console.warn("The name of the sprite you want to find is not exit in SpriteAtlas.");
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
  _addSprite(sprite: Sprite): void {
    this._spriteNamesToIndex[sprite.name] = this._sprites.push(sprite) - 1;
    sprite._atlas = this;
    sprite.isGCIgnored = true;
  }

  /**
   * @internal
   */
  protected override _onDestroy(): void {
    super._onDestroy();
    const { _sprites: sprites } = this;
    for (let i = 0, n = sprites.length; i < n; i++) {
      sprites[i].destroy();
    }
    sprites.length = 0;
    this._sprites = null;
    this._spriteNamesToIndex = null;
  }
}
