import {
  AssetPromise,
  AssetType,
  Loader,
  LoadItem,
  resourceLoader,
  ResourceManager,
  Sprite,
  SpriteAtlas,
  Texture2D
} from "@oasis-engine/core";
import { AtlasConfig } from "@oasis-engine/core/types/2d/atlas/types";
import { Rect, Vector2, Vector4 } from "@oasis-engine/math";
import { GLTFUtil } from "./gltf/GLTFUtil";

@resourceLoader(AssetType.SpriteAtlas, ["atlas"], false)
class SpriteAtlasLoader extends Loader<SpriteAtlas> {
  private _tempRect: Rect = new Rect();
  private _tempVec2: Vector2 = new Vector2();
  private _tempVec4: Vector4 = new Vector4();
  load(item: LoadItem, resourceManager: ResourceManager): Record<string, AssetPromise<any>> {
    const promiseMap = {};
    const atlasPromise = (promiseMap[`${item.url}`] = new AssetPromise<SpriteAtlas>((resolve, reject, _, onCancel) => {
      const chainPromises = [];
      onCancel(() => {
        for (let i = 0; i < chainPromises.length; i++) {
          chainPromises[i].cancel();
        }
      });
      const configPromise = this.request<AtlasConfig>(item.url, {
        ...item,
        type: "json"
      });
      chainPromises.push(configPromise);
      configPromise
        .then((atlasData) => {
          const { atlasItems } = atlasData;
          const atlasItemsLen = atlasItems?.length;
          const imagePromises = AssetPromise.all(
            atlasItems
              ? atlasItems.map(({ img }) =>
                  this.request<HTMLImageElement>(GLTFUtil.parseRelativeUrl(item.url, img), {
                    ...item,
                    type: "image"
                  })
                )
              : []
          );
          chainPromises.push(imagePromises);
          return imagePromises.then((imgs) => {
            const { engine } = resourceManager;
            // Generate a SpriteAtlas object.
            const { _tempRect: tempRect, _tempVec2: tempVec2, _tempVec4: tempVec4 } = this;
            const spriteAtlas = new SpriteAtlas(engine);
            const { mipmap, anisoLevel, filterMode, wrapModeU, wrapModeV, format } = atlasData;
            for (let i = 0; i < atlasItemsLen; i++) {
              // Generate Texture2D according to configuration.
              const originalImg = imgs[i];
              const { width, height } = originalImg;
              const texture = new Texture2D(engine, width, height, format, mipmap);
              texture.setImageSource(originalImg);
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
                const { region, atlasRegionOffset, atlasRegion, pivot, border } = atlasSprite;
                const sprite = new Sprite(
                  engine,
                  texture,
                  region ? tempRect.set(region.x, region.y, region.w, region.h) : undefined,
                  pivot ? tempVec2.set(pivot.x, pivot.y) : undefined,
                  border ? tempVec4.set(border.x, border.y, border.z, border.w) : undefined,
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
          });
        })
        .catch(reject);
    }));
    promiseMap[`${item.url}?q=sprites`] = new AssetPromise<Sprite[]>((resolve, reject, _, onCancel) => {
      onCancel(() => {
        atlasPromise.cancel();
      });
      atlasPromise
        .then((spriteAtlas) => {
          // @ts-ignore
          resolve(spriteAtlas._sprites);
        })
        .catch(reject);
    });
    return promiseMap;
  }
}
