import {
  resourceLoader,
  Loader,
  AssetPromise,
  AssetType,
  LoadItem,
  ResourceManager,
  Texture2D,
  Sprite,
  SpriteAtlas
} from "@oasis-engine/core";
import { AtlasConfig } from "@oasis-engine/core/types/2d/atlas/types";
import { Rect, Vector2 } from "@oasis-engine/math";

@resourceLoader(AssetType.SpriteAtlas, ["atlas"], false)
class SpriteAtlasLoader extends Loader<SpriteAtlas> {
  load(item: LoadItem, resourceManager: ResourceManager): AssetPromise<SpriteAtlas> {
    return new AssetPromise((resolve, reject) => {
      this.request<AtlasConfig>(item.url, {
        ...item,
        type: "json"
      })
        .then((atlasData) => {
          const atlasItems = atlasData.AtlasItems;
          const atlasItemsLen = atlasItems.length;
          const picsArr: string[] = new Array(atlasItemsLen);
          // Load the texture used in the atlas.
          for (let idx = atlasItemsLen - 1; idx >= 0; idx--) {
            picsArr[idx] = atlasItems[idx].img;
          }
          Promise.all(
            picsArr.map((url) =>
              this.request<HTMLImageElement>(url, {
                ...item,
                type: "image"
              })
            )
          ).then((imgs) => {
            const engine = resourceManager.engine;
            // Generate a SpriteAtlas object
            const spriteAtlas = new SpriteAtlas(engine);
            /** @ts-ignore */
            const spriteMap = spriteAtlas._spritesMap;
            const format = atlasData.format;
            const texturesArr: Texture2D[] = new Array(atlasItemsLen);
            for (let idx = atlasItemsLen - 1; idx >= 0; idx--) {
              // Generate Texture2D according to configuration
              const originalImg = imgs[idx];
              const { width, height } = originalImg;
              const texture = new Texture2D(engine, width, height, format);
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
                spriteMap[key] = sprite;
              }
            }
            // Return a SpriteAtlas instance.
            resolve(spriteAtlas);
          });
        })
        .catch((e) => {
          reject(e);
        });
    });
  }
}
