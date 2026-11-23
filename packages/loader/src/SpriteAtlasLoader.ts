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
      let configPromise: AssetPromise<AtlasConfig> | null = null;
      let spriteAtlas: SpriteAtlas | null = null;
      let aborted = false;
      const abort = () => {
        if (aborted) return;
        aborted = true;
        configPromise?.cancel();
        if (spriteAtlas) {
          if (!spriteAtlas.destroyed) {
            spriteAtlas._addReferCount(-1);
            spriteAtlas.destroy();
          }
          spriteAtlas = null;
        }
      };
      onCancel(abort);
      configPromise = resourceManager._request<AtlasConfig>(item.url!, {
        ...item,
        type: "json"
      });
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
          // Hold an in-flight reference until all pages load so concurrent gc() will not collect partial atlas state
          atlas._addReferCount(1);
          spriteAtlas = atlas;
          const pagePromises: AssetPromise<void>[] = [];
          for (let i = 0; i < atlasItemsLen; i++) {
            const atlasItem = atlasItems[i];
            if (atlasItem.img) {
              pagePromises.push(
                resourceManager
                  .load<Texture2D>({
                    url: Utils.resolveAbsoluteUrl(item.url!, atlasItem.img),
                    type: atlasItem.type ?? AssetType.Texture,
                    params: { format, mipmap }
                  })
                  .then((texture: Texture2D) => {
                    if (aborted || atlas.destroyed) return;
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
          AssetPromise.all(pagePromises)
            .then(() => {
              if (aborted || atlas.destroyed) return;
              spriteAtlas = null;
              atlas._addReferCount(-1);
              resolve(atlas);
            })
            .catch((e) => {
              abort();
              reject(e);
            });
        })
        .catch((e) => {
          abort();
          reject(e);
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
