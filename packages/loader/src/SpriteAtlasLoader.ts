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
          const { atlasItems, format } = atlasData;
          const atlasItemsLen = atlasItems.length;
          Promise.all(
            atlasItems.map(({ img }) =>
              this.request<HTMLImageElement>(img, {
                ...item,
                type: "image"
              })
            )
          ).then((imgs) => {
            const { engine } = resourceManager;
            // Generate a SpriteAtlas object
            const spriteAtlas = new SpriteAtlas(engine);
            /** @ts-ignore */
            const spriteMap = spriteAtlas._spritesMap;
            const texturesArr = new Array<Texture2D>(atlasItemsLen);
            for (let idx = atlasItemsLen - 1; idx >= 0; idx--) {
              // Generate Texture2D according to configuration
              const originalImg = imgs[idx];
              const { width, height } = originalImg;
              const texture = new Texture2D(engine, width, height, format);
              texture.setImageSource(originalImg);
              texture.generateMipmaps();
              texturesArr[idx] = texture;
              // Generate all the sprites on this texture.
              const atlasItem = atlasItems[idx];
              const sprites = atlasItem.sprites;
              const [sourceWidth, sourceHeight] = atlasItem.size;
              const sourceWidthReciprocal = 1.0 / sourceWidth;
              const sourceHeightReciprocal = 1.0 / sourceHeight;
              for (let spriteIdx = sprites.length - 1; spriteIdx >= 0; spriteIdx--) {
                const atlasSprite = sprites[spriteIdx];
                const { region, pivot, atlasRegionOffset, atlasRegion } = atlasSprite;
                const sprite = new Sprite(
                  engine,
                  texture,
                  new Rect(region.x, region.y, region.w, region.h),
                  new Vector2(pivot.x, pivot.y),
                  atlasSprite.pixelsPerUnit
                );
                sprite.atlasRegion.setValue(
                  atlasRegion.x * sourceWidthReciprocal,
                  atlasRegion.y * sourceHeightReciprocal,
                  atlasRegion.w * sourceWidthReciprocal,
                  atlasRegion.h * sourceHeightReciprocal
                );
                sprite.atlasRegionOffset.setValue(atlasRegionOffset.x, atlasRegionOffset.y);
                spriteMap[atlasSprite.name] = sprite;
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
