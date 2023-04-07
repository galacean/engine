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
} from "@galacean/engine-core";

@resourceLoader(AssetType.Sprite, ["sprite"], false)
class SpriteLoader extends Loader<Sprite> {
  load(item: LoadItem, resourceManager: ResourceManager): AssetPromise<Sprite> {
    return new AssetPromise((resolve, reject) => {
      this.request<any>(item.url, {
        ...item,
        type: "json"
      })
        .then((data) => {
          if (data.belongToAtlas) {
            resourceManager
              // @ts-ignore
              .getResourceByRef<SpriteAtlas>(data.belongToAtlas)
              .then((atlas) => {
                resolve(atlas.getSprite(data.fullPath));
              })
              .catch(reject);
          } else if (data.texture) {
            resourceManager
              // @ts-ignore
              .getResourceByRef<Texture2D>(data.texture)
              .then((texture) => {
                resolve(new Sprite(resourceManager.engine, texture, data.region, data.pivot, data.border));
              })
              .catch(reject);
          } else {
            resolve(new Sprite(resourceManager.engine, null, data.region, data.pivot, data.border));
          }
        })
        .catch(reject);
    });
  }
}
