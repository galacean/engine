import {
  AssetPromise,
  AssetType,
  Loader,
  LoadItem,
  resourceLoader,
  ResourceManager,
  Texture2D
} from "@oasis-engine/core";

@resourceLoader(AssetType.Texture2D, ["png", "jpg", "webp", "jpeg"])
class Texture2DLoader extends Loader<Texture2D> {
  load(item: LoadItem, resourceManager: ResourceManager): AssetPromise<Texture2D> {
    return new AssetPromise((resolve, reject) => {
      this.request<HTMLImageElement>(item.url, {
        ...item,
        type: "image"
      })
        .then((image) => {
          const texture = new Texture2D(resourceManager.engine, image.width, image.height);
          if (!texture._platformTexture) return;

          texture.setImageSource(image);
          texture.generateMipmaps();

          resolve(texture);
        })
        .catch((e) => {
          reject(e);
        });
    });
  }
}
