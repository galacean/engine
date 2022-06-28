import { resourceLoader, Loader, AssetPromise, AssetType, LoadItem, Sprite, Texture2D, ResourceManager } from "@oasis-engine/core";

@resourceLoader(AssetType.Sprite, ["sprite"], false)
class SpriteLoader extends Loader<Sprite> {
  load(item: LoadItem, resourceManager: ResourceManager): AssetPromise<Sprite> {
    debugger;
    return new AssetPromise((resolve, reject) => {
      this.request<any>(item.url, {
        ...item,
        type: "json"
      }).then((data) => {
        const textureInfo = data.texture;
        const refId = textureInfo.refId;
        resourceManager.getResourceByRef<Texture2D>({ refId: refId }).then((texture) => {
          const sprite = new Sprite(resourceManager.engine, texture);
          sprite.region = data.region;
          sprite.pivot = data.pivot;
          sprite.pixelsPerUnit = data.pixelsPerUnit;
          resolve(sprite);
        });
      });
    });
  }
}
