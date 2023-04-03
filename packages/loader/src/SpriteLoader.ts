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
    return new AssetPromise((resolve, reject) =>
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
                resolve(atlas.getSprite(data.fullPath));
              })
              .catch(reject);
          } else {
            resourceManager
              // @ts-ignore
              .getResourceByRef<Texture2D>(data.texture)
              .then((texture) => {
                const sprite = new Sprite(resourceManager.engine, texture);
                sprite.region = data.region;
                sprite.pivot = data.pivot;
                resolve(sprite);
              })
              .catch(reject);
          }
        })
        .catch(reject)
    );
  }
}
