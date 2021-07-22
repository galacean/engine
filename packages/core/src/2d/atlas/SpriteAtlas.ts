import { RefObject } from "../../asset/RefObject";
import { Engine } from "../../Engine";
import { Sprite } from "../sprite/Sprite";

/**
 * Sprite Atlas.
 */
export class SpriteAtlas extends RefObject {
  /** @internal */
  _spritesMap: Record<string, Sprite> = {};

  /**
   * Get the sprite named 'name' from the atlas.
   * @param name - The name of the sprite you want to find
   * @returns The sprite you want to find
   */
  public getSprite(name: string): Sprite {
    const sprite = this._spritesMap[name];
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
    const spritesMap = this._spritesMap;
    for (let key in spritesMap) {
      sprites.push(spritesMap[key]);
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
    if (this._spritesMap) {
      this._spritesMap = null;
    }
  }
}
