import { Rect, Vector2 } from "@oasis-engine/math";
import { RefObject } from "../../asset/RefObject";
import { Engine } from "../../Engine";
import { Texture2D } from "../../texture";
import { AtlasConfig } from "./types";
import { Sprite } from "../sprite/Sprite";

/**
 * Sprite Atlas.
 */
export class SpriteAtlas extends RefObject {
  // Save all sprite instances in the Atlas.
  private _spritesMap: { [key: string]: Sprite } = {};

  /**
   * Get the sprite named 'name' from the atlas.
   * @param name
   * @returns
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
   * @returns
   */
  public getSprites(): Sprite[] {
    const sprites: Sprite[] = [];
    const spritesMap = this._spritesMap;
    for (let key in spritesMap) {
      sprites.push(spritesMap[key]);
    }
    return sprites;
  }

  /**
   * Pass in atlas data and pictures to parse out the included sprites.
   * @param config Raw data.
   * @param originalImgs Original images.
   * @returns
   */
  private _initialization(config: AtlasConfig, originalImgs: HTMLImageElement[]): void {
    const { engine, _spritesMap: spritesMap } = this;
    const atlasItems = config.AtlasItems;
    const atlasItemsLen = atlasItems.length;
    const texturesArr: Texture2D[] = new Array(atlasItemsLen);
    for (let idx = atlasItemsLen - 1; idx >= 0; idx--) {
      // Generate Texture2D according to configuration
      const originalImg = originalImgs[idx];
      const { width, height } = originalImg;
      const texture = new Texture2D(engine, width, height, config.format);
      /** @ts-ignore */
      if (!texture._platformTexture) return;
      texture.setImageSource(originalImg);
      texture.generateMipmaps();
      texturesArr[idx] = texture;

      // Generate all the sprites on this texture.
      const atlasItem = atlasItems[idx];
      const frames = atlasItem.frames;
      const [sourceWidth, sourceHeight] = atlasItem.size;
      const sourceWidthReciprocal = 1.0 / sourceWidth;
      const sourceHeightReciprocal = 1.0 / sourceHeight;
      for (var key in frames) {
        const frame = frames[key];
        const region = frame.region;
        const pivot = frame.pivot;
        const offset = frame.offset;
        const atlasRegion = frame.atlasRegion;
        const sprite = new Sprite(
          engine,
          texture,
          new Rect(region.x, region.y, region.w, region.h),
          new Vector2(pivot.x, pivot.y),
          frame.pixelsPerUnit
        );
        sprite.atlasRegion = new Rect(
          atlasRegion.x * sourceWidthReciprocal,
          atlasRegion.y * sourceHeightReciprocal,
          atlasRegion.w * sourceWidthReciprocal,
          atlasRegion.h * sourceHeightReciprocal
        );
        sprite.offset = new Vector2(offset.x, offset.y);
        spritesMap[key] = sprite;
      }
    }
  }

  /**
   * Constructor a sprite.
   * @param engine
   * @param atlasData Raw data.
   * @param imgs Original images.
   */
  constructor(engine: Engine, atlasData: AtlasConfig, imgs: HTMLImageElement[]) {
    super(engine);
    this._initialization(atlasData, imgs);
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
