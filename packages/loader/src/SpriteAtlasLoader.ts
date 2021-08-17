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
            const tempRect = new Rect();
            const tempVect2 = new Vector2();
            const spriteAtlas = new SpriteAtlas(engine);
            for (let i = 0; i < atlasItemsLen; i++) {
              // Generate Texture2D according to configuration
              const originalImg = imgs[i];
              const { width, height } = originalImg;
              const texture = new Texture2D(engine, width, height, format);
              texture.setImageSource(originalImg);
              texture.generateMipmaps();
              // Generate all the sprites on this texture.
              const atlasItem = atlasItems[i];
              const sprites = atlasItem.sprites;
              const sourceWidthReciprocal = 1.0 / width;
              const sourceHeightReciprocal = 1.0 / height;
              for (let j = sprites.length - 1; j >= 0; j--) {
                const atlasSprite = sprites[j];
                const { region, pivot } = atlasSprite;
                const { w: originalW, h: originalH } = atlasSprite.originalSize;
                const { x: atlasRegionX, y: atlasRegionY, w: atlasRegionW, h: atlasRegionH } = atlasSprite.atlasRegion;
                const sprite = new Sprite(
                  engine,
                  texture,
                  region ? tempRect.setValue(region.x, region.y, region.w, region.h) : undefined,
                  pivot ? tempVect2.setValue(pivot.x, pivot.y) : undefined,
                  atlasSprite.pixelsPerUnit || undefined,
                  atlasSprite.name
                );
                sprite.atlasRegion.setValue(
                  atlasRegionX * sourceWidthReciprocal,
                  atlasRegionY * sourceHeightReciprocal,
                  atlasRegionW * sourceWidthReciprocal,
                  atlasRegionH * sourceHeightReciprocal
                );
                let isTrimmed: boolean;
                // The original size is a necessary parameter.
                if (atlasSprite.atlasRotated) {
                  sprite.atlasRotated = true;
                  isTrimmed = originalW != atlasRegionH || originalH != atlasRegionW;
                } else {
                  isTrimmed = originalW != atlasRegionW || originalH != atlasRegionH;
                }
                if (isTrimmed) {
                  sprite.setTrimmed(true);
                  const { x: atlasRegionOffsetX, y: atlasRegionOffsetY } = atlasSprite.atlasRegionOffset;
                  if (atlasSprite.atlasRotated) {
                    sprite.atlasRegionOffset.setValue(
                      atlasRegionOffsetX / originalW,
                      atlasRegionOffsetY / originalH,
                      1 - (atlasRegionH + atlasRegionOffsetX) / originalW,
                      1 - (atlasRegionW + atlasRegionOffsetY) / originalH
                    );
                  } else {
                    sprite.atlasRegionOffset.setValue(
                      atlasRegionOffsetX / originalW,
                      atlasRegionOffsetY / originalH,
                      1 - (atlasRegionW + atlasRegionOffsetX) / originalW,
                      1 - (atlasRegionH + atlasRegionOffsetY) / originalH
                    );
                  }
                }
                /** @ts-ignore */
                spriteAtlas._addSprite(sprite);
              }
            }
            resolve(spriteAtlas);
          });
        })
        .catch((e) => {
          reject(e);
        });
    });
  }
}
