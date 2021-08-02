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
            const texturesArr = new Array<Texture2D>(atlasItemsLen);
            for (let i = 0; i < atlasItemsLen; i++) {
              // Generate Texture2D according to configuration
              const originalImg = imgs[i];
              const { width, height } = originalImg;
              const texture = new Texture2D(engine, width, height, format);
              texture.setImageSource(originalImg);
              texture.generateMipmaps();
              texturesArr[i] = texture;
              // Generate all the sprites on this texture.
              const atlasItem = atlasItems[i];
              const sprites = atlasItem.sprites;
              const [sourceWidth, sourceHeight] = atlasItem.size;
              const sourceWidthReciprocal = 1.0 / sourceWidth;
              const sourceHeightReciprocal = 1.0 / sourceHeight;
              for (let j = sprites.length - 1; j >= 0; j--) {
                const atlasSprite = sprites[j];
                const { region, pivot, atlasRegionOffset, atlasRegion } = atlasSprite;
                const sprite = new Sprite(
                  engine,
                  texture,
                  new Rect(region.x, region.y, region.w, region.h),
                  new Vector2(pivot.x, pivot.y),
                  atlasSprite.pixelsPerUnit,
                  atlasSprite.name
                );
                sprite.atlasRegion.setValue(
                  atlasRegion.x * sourceWidthReciprocal,
                  atlasRegion.y * sourceHeightReciprocal,
                  atlasRegion.w * sourceWidthReciprocal,
                  atlasRegion.h * sourceHeightReciprocal
                );
                sprite.atlasRegionOffset.setValue(atlasRegionOffset.x, atlasRegionOffset.y);
                /** @ts-ignore */
                spriteAtlas._addSprite(sprite);
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
