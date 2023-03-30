import {
  resourceLoader,
  Loader,
  AssetPromise,
  AssetType,
  LoadItem,
  Sprite,
  Texture2D,
  ResourceManager
} from "@oasis-engine/core";

@resourceLoader(AssetType.Sprite, ["sprite"], false)
class SpriteLoader extends Loader<Sprite> {
  load(item: LoadItem, resourceManager: ResourceManager): AssetPromise<Sprite> {
    return new AssetPromise((resolve, reject) => {
      this.request<any>(item.url, {
        ...item,
        type: "json"
      })
        .then((data) => {
          // @ts-ignore
          resourceManager.getResourceByRef<Texture2D>(data.texture).then((texture) => {
            const sprite = new Sprite(resourceManager.engine, texture);
            sprite.region = data.region;
            sprite.pivot = data.pivot;
            resolve(sprite);
          });
        })
        .catch(reject);
    });
  }
}
