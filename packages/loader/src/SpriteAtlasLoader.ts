import {
  AssetPromise,
  AssetType,
  Engine,
  Loader,
  LoadItem,
  resourceLoader,
  ResourceManager,
  Sprite,
  SpriteAtlas,
  Texture2D,
  Utils
} from "@galacean/engine-core";
import { AtlasConfig, AtlasSprite } from "@galacean/engine-core/types/2d/atlas/types";
import { Rect, Vector2, Vector4 } from "@galacean/engine-math";

@resourceLoader(AssetType.SpriteAtlas, ["atlas"])
class SpriteAtlasLoader extends Loader<SpriteAtlas> {
  private _tempRect: Rect = new Rect();
  private _tempVec2: Vector2 = new Vector2();
  private _tempVec4: Vector4 = new Vector4();
  load(item: LoadItem, resourceManager: ResourceManager): AssetPromise<SpriteAtlas> {
    return new AssetPromise<SpriteAtlas>((resolve, reject, _, __, onCancel) => {
      const chainPromises: AssetPromise<unknown>[] = [];
      let spriteAtlas: SpriteAtlas | null = null;
      let aborted = false;
      const abort = () => {
        if (aborted) return;
        aborted = true;
        for (let i = 0; i < chainPromises.length; i++) {
          chainPromises[i].cancel();
        }
        if (spriteAtlas && !spriteAtlas.destroyed) {
          spriteAtlas._addReferCount(-1);
          spriteAtlas.destroy();
        }
        spriteAtlas = null;
      };
      onCancel(abort);
      const configPromise = resourceManager._request<AtlasConfig>(item.url!, {
        ...item,
        type: "json"
      });
      chainPromises.push(configPromise);
      configPromise
        .then((atlasData) => {
          if (aborted) return;
          const { atlasItems, mipmap, anisoLevel, filterMode, wrapModeU, wrapModeV, format } = atlasData;
          const atlasItemsLen = atlasItems ? atlasItems.length : 0;
          const { engine } = resourceManager;
          const atlas = new SpriteAtlas(engine);
          if (atlasItemsLen <= 0) {
            resolve(atlas);
            return;
          }
          // Hold an in-flight reference until all pages load so concurrent gc() will not collect the atlas or loaded pages
          atlas._addReferCount(1);
          spriteAtlas = atlas;
          chainPromises.length = 0;
          const pageTasks: AssetPromise<void>[] = [];
          for (let i = 0; i < atlasItemsLen; i++) {
            const atlasItem = atlasItems[i];
            if (atlasItem.img) {
              const texturePromise = resourceManager.load<Texture2D>({
                url: Utils.resolveAbsoluteUrl(item.url!, atlasItem.img),
                type: atlasItem.type ?? AssetType.Texture,
                params: { format, mipmap }
              });
              chainPromises.push(texturePromise);
              pageTasks.push(
                texturePromise.then((texture: Texture2D) => {
                  if (aborted) return;
                  anisoLevel && (texture.anisoLevel = anisoLevel);
                  filterMode !== undefined && (texture.filterMode = filterMode);
                  wrapModeU !== undefined && (texture.wrapModeU = wrapModeU);
                  wrapModeV !== undefined && (texture.wrapModeV = wrapModeV);
                  texture._associationSuperResource(atlas);
                  for (let j = 0; j < atlasItem.sprites.length; j++) {
                    atlas._addSprite(this._makeSprite(engine, atlasItem.sprites[j], texture));
                  }
                })
              );
            } else {
              for (let j = 0; j < atlasItem.sprites.length; j++) {
                atlas._addSprite(this._makeSprite(engine, atlasItem.sprites[j]));
              }
            }
          }
          AssetPromise.all(pageTasks)
            .then(() => {
              if (aborted) return;
              spriteAtlas = null;
              if (!atlas.destroyed) {
                atlas._addReferCount(-1);
                resolve(atlas);
              } else {
                reject(new Error("SpriteAtlas was destroyed during load."));
              }
            })
            .catch((error) => {
              abort();
              reject(error);
            });
        })
        .catch((error) => {
          abort();
          reject(error);
        });
    });
  }

  private _makeSprite(engine: Engine, config: AtlasSprite, texture?: Texture2D): Sprite {
    // Generate a SpriteAtlas object.
    const { region, atlasRegionOffset, atlasRegion, pivot, border, width, height } = config;
    const sprite = new Sprite(
      engine,
      texture,
      region ? this._tempRect.set(region.x, region.y, region.w, region.h) : undefined,
      pivot ? this._tempVec2.set(pivot.x, pivot.y) : undefined,
      border ? this._tempVec4.set(border.x, border.y, border.z, border.w) : undefined,
      config.name
    );
    if (texture) {
      const invW = 1 / texture.width;
      const invH = 1 / texture.height;
      sprite.atlasRegion.set(atlasRegion.x * invW, atlasRegion.y * invH, atlasRegion.w * invW, atlasRegion.h * invH);
      if (atlasRegionOffset) {
        const { x: offsetLeft, y: offsetTop, z: offsetRight, w: offsetBottom } = atlasRegionOffset;
        sprite.atlasRegionOffset.set(offsetLeft * invW, offsetTop * invH, offsetRight * invW, offsetBottom * invH);
      }
      config.atlasRotated && (sprite.atlasRotated = true);
    }
    width === undefined || (sprite.width = width);
    height === undefined || (sprite.height = height);
    return sprite;
  }
}
