import { RefObject } from "../../asset/RefObject";
import { Engine } from "../../Engine";
import { Sprite } from "../sprite/Sprite";

/**
 * Sprite Atlas.
 */
export class SpriteAtlas extends RefObject {
  /** @internal */
  _sprites = [];
  /** @internal */
  _spriteNamesToIndex: Record<string, number> = {};

  /** @internal */
  private _registerSprite(name: string, sprite: Sprite) {
    this._spriteNamesToIndex[name] = this._sprites.push(sprite) - 1;
  }

  /**
   * Get the sprite named 'name' from the atlas.
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
   * Get all the sprites in the atlas.
   * @returns all the sprites in the atlas
   */
  public getSprites(sprites: Sprite[]): Sprite[] {
    const len = this._sprites.length;
    for (let i = 0; i < len; i++) {
      sprites.push(this._sprites[i]);
    }
    return sprites;
  }

  /**
   * Constructor a SpriteAtlas.
   * @param engine - Engine to which the SpriteAtlas belongs
   */
  constructor(engine: Engine) {
    super(engine);
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
