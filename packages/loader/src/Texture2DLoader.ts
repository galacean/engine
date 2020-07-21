import { resourceLoader, Loader, AssetPromise, LoaderType, LoadItem, ResourceManager } from "@alipay/o3-core";
import { Texture2D } from "@alipay/o3-material";

@resourceLoader(LoaderType.Texture2D, ["png", "jpg", "webp"])
class Texture2DLoader extends Loader<Texture2D> {
  load(item: LoadItem, resourceManager: ResourceManager): AssetPromise<Texture2D> {
    return new AssetPromise((resolve, reject) => {
      this.request<HTMLImageElement>(item.url, {
        ...item,
        type: "image"
      })
        .then((image) => {
          const texture = new Texture2D(image.width, image.height, undefined, undefined, resourceManager.engine);
          texture.name = name;
          if (!texture._glTexture) return;
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
