import {
  resourceLoader,
  Loader,
  AssetPromise,
  AssetType,
  LoadItem,
  Sprite,
  Texture2D,
  ResourceManager,
  SpriteAtlas
} from "@oasis-engine/core";

@resourceLoader(AssetType.Sprite, ["sprite"], false)
class SpriteLoader extends Loader<Sprite> {
  load(item: LoadItem, resourceManager: ResourceManager): AssetPromise<Sprite> {
    const getSpriteByTexture2D = (data, resolve, reject) => {
      resourceManager
        // @ts-ignore
        .getResourceByRef<Texture2D>(data.texture)
        .then((texture) => {
          const sprite = new Sprite(resourceManager.engine, texture);
          sprite.region = data.region;
          sprite.pivot = data.pivot;
          resolve(sprite);
        })
        .catch((reason: any) => {
          reject(reason);
        });
    };

    return new AssetPromise((resolve, reject) => {
      this.request<any>(item.url, {
        ...item,
        type: "json"
      })
        .then((data) => {
          const belongTo = data.belongTo;
          if (belongTo && belongTo.length > 0) {
            resourceManager
              // @ts-ignore
              .getResourceByRef<SpriteAtlas>(belongTo[0])
              .then((atlas) => {
                const sprite = atlas.getSprite(data.fullPath);
                if (sprite) {
                  resolve(sprite);
                } else {
                  getSpriteByTexture2D(data, resolve, reject);
                }
              })
              .catch((reason: any) => {
                getSpriteByTexture2D(data, resolve, reject);
              });
          } else {
            getSpriteByTexture2D(data, resolve, reject);
          }
        })
        .catch((reason: any) => {
          reject(reason);
        });
    });
  }
}
