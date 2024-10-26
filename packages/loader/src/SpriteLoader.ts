import {
  AssetPromise,
  AssetType,
  LoadItem,
  Loader,
  ResourceManager,
  Sprite,
  SpriteAtlas,
  Texture2D,
  resourceLoader
} from "@galacean/engine-core";

@resourceLoader(AssetType.Sprite, ["sprite"], false)
class SpriteLoader extends Loader<Sprite> {
  load(item: LoadItem, resourceManager: ResourceManager): AssetPromise<Sprite> {
    return this.request<any>(item.url, {
      ...item,
      type: "json"
    }).then((data) => {
      return data.belongToAtlas
        ? this._loadFromAtlas(resourceManager, data)
        : this._loadFromTexture(resourceManager, data);
    });
  }

  private _loadFromAtlas(resourceManager: ResourceManager, data: any): AssetPromise<Sprite> {
    return (
      resourceManager
        // @ts-ignore
        .getResourceByRef(data.belongToAtlas)
        .then((atlas: SpriteAtlas) => {
          return atlas.getSprite(data.fullPath) || this._loadFromTexture(resourceManager, data);
        })
    );
  }

  private _loadFromTexture(resourceManager: ResourceManager, data: any): AssetPromise<Sprite> {
    if (data.texture) {
      return (
        resourceManager
          // @ts-ignore
          .getResourceByRef(data.texture)
          .then((texture: Texture2D) => {
            const sprite = new Sprite(resourceManager.engine, texture, data.region, data.pivot, data.border);
            const { width, height } = data;
            isNaN(width) || (sprite.width = width);
            isNaN(height) || (sprite.height = height);
            return sprite;
          })
      );
    } else {
      return new AssetPromise((resolve) => {
        const sprite = new Sprite(resourceManager.engine, null, data.region, data.pivot, data.border);
        const { width, height } = data;
        isNaN(width) || (sprite.width = width);
        isNaN(height) || (sprite.height = height);
        resolve(sprite);
      });
    }
  }
}
