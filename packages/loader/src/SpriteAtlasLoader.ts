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
      const loadedTextures: Texture2D[] = [];
      let aborted = false;
      const releaseLoadedTextures = () => {
        for (let i = 0, n = loadedTextures.length; i < n; i++) {
          loadedTextures[i]._addReferCount(-1);
        }
        loadedTextures.length = 0;
      };
      const configPromise = resourceManager._request<AtlasConfig>(item.url!, {
        ...item,
        type: "json"
      });
      const abort = () => {
        if (aborted) return;
        aborted = true;
        configPromise.cancel();
        releaseLoadedTextures();
      };
      onCancel(abort);
      configPromise
        .then((atlasData) => {
          if (aborted) return;
          const { atlasItems, mipmap, anisoLevel, filterMode, wrapModeU, wrapModeV, format } = atlasData;
          const atlasItemsLen = atlasItems ? atlasItems.length : 0;
          const { engine } = resourceManager;
          if (atlasItemsLen <= 0) {
            resolve(new SpriteAtlas(engine));
            return;
          }
          const pagePromises: AssetPromise<Texture2D | undefined>[] = [];
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
                    if (aborted) return undefined;
                    // Hold an in-flight reference until all pages load so concurrent gc() will not collect finished pages
                    texture._addReferCount(1);
                    loadedTextures.push(texture);
                    return texture;
                  })
              );
            } else {
              pagePromises.push(AssetPromise.resolve(undefined));
            }
          }
          return AssetPromise.all(pagePromises).then((textures) => {
            if (aborted) return;
            const atlas = new SpriteAtlas(engine);
            for (let i = 0; i < atlasItemsLen; i++) {
              const atlasItem = atlasItems[i];
              const texture = textures[i];
              if (texture) {
                anisoLevel && (texture.anisoLevel = anisoLevel);
                filterMode !== undefined && (texture.filterMode = filterMode);
                wrapModeU !== undefined && (texture.wrapModeU = wrapModeU);
                wrapModeV !== undefined && (texture.wrapModeV = wrapModeV);
                texture._associationSuperResource(atlas);
              }
              for (let j = 0; j < atlasItem.sprites.length; j++) {
                atlas._addSprite(this._makeSprite(engine, atlasItem.sprites[j], texture));
              }
            }
            releaseLoadedTextures();
            resolve(atlas);
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
