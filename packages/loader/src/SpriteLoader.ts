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
    return new AssetPromise((resolve, reject) => {
      this.request<any>(item.url, {
        ...item,
        type: "json"
      })
        .then((data) => {
          (data.belongToAtlas
            ? this._loadFromAtlas(resourceManager, data)
            : this._loadFromTexture(resourceManager, data)
          )
            .then(resolve)
            .catch(reject);
        })
        .catch(reject);
    });
  }

  private _loadFromAtlas(resourceManager: ResourceManager, data: any): Promise<Sprite> {
    return new Promise<Sprite>((resolve, reject) => {
      resourceManager
        // @ts-ignore
        .getResourceByRef(data.belongToAtlas)
        .then((atlas: SpriteAtlas) => {
          const sprite = atlas.getSprite(data.fullPath);
          if (sprite) {
            resolve(sprite);
          } else {
            this._loadFromTexture(resourceManager, data).then((sprite) => {
              resolve(sprite);
            });
          }
        })
        .catch(reject);
    });
  }

  private _loadFromTexture(resourceManager: ResourceManager, data: any): Promise<Sprite> {
    if (data.texture) {
      return new Promise<Sprite>((resolve, reject) => {
        resourceManager
          // @ts-ignore
          .getResourceByRef(data.texture)
          .then((texture: Texture2D) => {
            resolve(new Sprite(resourceManager.engine, texture, data.region, data.pivot, data.border));
          })
          .catch(reject);
      });
    } else {
      return Promise.resolve(new Sprite(resourceManager.engine, null, data.region, data.pivot, data.border));
    }
  }
}
