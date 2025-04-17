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

@resourceLoader(AssetType.SpriteAtlas, ["atlas"], false)
class SpriteAtlasLoader extends Loader<SpriteAtlas> {
  private _tempRect: Rect = new Rect();
  private _tempVec2: Vector2 = new Vector2();
  private _tempVec4: Vector4 = new Vector4();
  load(item: LoadItem, resourceManager: ResourceManager): AssetPromise<SpriteAtlas> {
    const url = item.url;
    return (
      resourceManager
        // @ts-ignore
        ._request<AtlasConfig>(url, {
          ...item,
          type: "json"
        })
        .then((atlasData) => {
          const { atlasItems, mipmap, anisoLevel, filterMode, wrapModeU, wrapModeV, format } = atlasData;
          const atlasItemsLen = atlasItems ? atlasItems.length : 0;
          const { engine } = resourceManager;
          const spriteAtlas = new SpriteAtlas(engine);
          if (atlasItemsLen <= 0) return spriteAtlas;
          const promises = [];
          for (let i = 0; i < atlasItemsLen; i++) {
            const atlasItem = atlasItems[i];
            if (atlasItem.img) {
              const promise = resourceManager
                .load<Texture2D>({
                  url: Utils.resolveAbsoluteUrl(url, atlasItem.img),
                  type: atlasItem.type ?? AssetType.Texture2D,
                  params: { format, mipmap }
                })
                .then((texture: Texture2D) => {
                  anisoLevel && (texture.anisoLevel = anisoLevel);
                  filterMode !== undefined && (texture.filterMode = filterMode);
                  wrapModeU !== undefined && (texture.wrapModeU = wrapModeU);
                  wrapModeV !== undefined && (texture.wrapModeV = wrapModeV);
                  for (let i = 0; i < atlasItem.sprites.length; i++) {
                    // @ts-ignore
                    spriteAtlas._addSprite(this._makeSprite(engine, atlasItem.sprites[i], texture));
                  }
                });
              promises.push(promise);
            } else {
              for (let i = 0; i < atlasItem.sprites.length; i++) {
                // @ts-ignore
                spriteAtlas._addSprite(this._makeSprite(engine, atlasItem.sprites[i]));
              }
            }
          }
          return AssetPromise.all(promises).then(() => spriteAtlas);
        })
    );
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
    isNaN(width) || (sprite.width = width);
    isNaN(height) || (sprite.height = height);
    return sprite;
  }
}
