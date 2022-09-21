import {
  AssetPromise,
  AssetType,
  Loader,
  LoadItem,
  resourceLoader,
  ResourceManager,
  Sprite,
  SpriteAtlas,
  Texture2D,
  TextureFilterMode
} from "@oasis-engine/core";
import { AtlasConfig } from "@oasis-engine/core/types/2d/atlas/types";
import { Rect, Vector2 } from "@oasis-engine/math";
import { GLTFUtil } from "./gltf/GLTFUtil";

@resourceLoader(AssetType.SpriteAtlas, ["atlas"], false)
class SpriteAtlasLoader extends Loader<SpriteAtlas> {
  private _tempRect: Rect = new Rect();
  private _tempVec2: Vector2 = new Vector2();
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
              this.request<HTMLImageElement>(GLTFUtil.parseRelativeUrl(item.url, img), {
                ...item,
                type: "image"
              })
            )
          )
            .then((imgs) => {
              const { engine } = resourceManager;
              // Generate a SpriteAtlas object.
              const { _tempRect: tempRect, _tempVec2: tempVec2 } = this;
              const spriteAtlas = new SpriteAtlas(engine);
              const { mipmap, anisoLevel, filterMode, wrapModeU, wrapModeV } = atlasData;
              for (let i = 0; i < atlasItemsLen; i++) {
                // Generate Texture2D according to configuration.
                const originalImg = imgs[i];
                const { width, height } = originalImg;
                const texture = new Texture2D(engine, width, height, format);
                texture.setImageSource(originalImg);
                mipmap && texture.generateMipmaps();
                anisoLevel && (texture.anisoLevel = anisoLevel);
                filterMode !== undefined && (texture.filterMode = filterMode);
                wrapModeU !== undefined && (texture.wrapModeU = wrapModeU);
                wrapModeV !== undefined && (texture.wrapModeV = wrapModeV);
                // Generate all the sprites on this texture.
                const atlasItem = atlasItems[i];
                const sprites = atlasItem.sprites;
                const sourceWidthReciprocal = 1.0 / width;
                const sourceHeightReciprocal = 1.0 / height;
                for (let j = sprites.length - 1; j >= 0; j--) {
                  const atlasSprite = sprites[j];
                  const { region, atlasRegionOffset, atlasRegion, pivot } = atlasSprite;
                  const sprite = new Sprite(
                    engine,
                    texture,
                    region ? tempRect.set(region.x, region.y, region.w, region.h) : undefined,
                    pivot ? tempVec2.set(pivot.x, pivot.y) : undefined,
                    undefined,
                    atlasSprite.name
                  );
                  sprite.atlasRegion.set(
                    atlasRegion.x * sourceWidthReciprocal,
                    atlasRegion.y * sourceHeightReciprocal,
                    atlasRegion.w * sourceWidthReciprocal,
                    atlasRegion.h * sourceHeightReciprocal
                  );
                  atlasSprite.atlasRotated && (sprite.atlasRotated = true);
                  if (atlasRegionOffset) {
                    const { x: offsetLeft, y: offsetTop, z: offsetRight, w: offsetBottom } = atlasRegionOffset;
                    sprite.atlasRegionOffset.set(
                      offsetLeft * sourceWidthReciprocal,
                      offsetTop * sourceHeightReciprocal,
                      offsetRight * sourceWidthReciprocal,
                      offsetBottom * sourceHeightReciprocal
                    );
                  }
                  // @ts-ignore
                  spriteAtlas._addSprite(sprite);
                }
              }
              resolve(spriteAtlas);
            })
            .catch((e) => {
              reject(e);
            });
        })
        .catch((e) => {
          reject(e);
        });
    });
  }
}
