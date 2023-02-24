import {
  AssetPromise,
  AssetType,
  ContentRestorer,
  Loader,
  LoadItem,
  request,
  resourceLoader,
  ResourceManager,
  TextureCube,
  TextureCubeFace
} from "@oasis-engine/core";
import { RequestConfig } from "@oasis-engine/core/types/asset/request";

@resourceLoader(AssetType.TextureCube, [""])
class TextureCubeLoader extends Loader<TextureCube> {
  /**
   * @override
   */
  load(item: LoadItem, resourceManager: ResourceManager): AssetPromise<TextureCube> {
    return new AssetPromise((resolve, reject) => {
      const urls = item.urls;
      const requestConfig = <RequestConfig>{
        ...item,
        type: "image"
      };

      Promise.all(urls.map((url) => this.request<HTMLImageElement>(url, requestConfig)))
        .then((images) => {
          const { width, height } = images[0];

          if (width !== height) {
            console.error("The cube texture must have the same width and height");
            return;
          }

          const texture = new TextureCube(resourceManager.engine, width);

          for (let faceIndex = 0; faceIndex < 6; faceIndex++) {
            texture.setImageSource(TextureCubeFace.PositiveX + faceIndex, images[faceIndex], 0);
          }

          texture.generateMipmaps();
          resourceManager.addContentRestorer(new TextureCubeContentRestorer(texture, urls, requestConfig));
          resolve(texture);
        })
        .catch((e) => {
          reject(e);
        });
    });
  }
}

class TextureCubeContentRestorer extends ContentRestorer<TextureCube> {
  constructor(resource: TextureCube, public urls: string[], public requestConfig: RequestConfig) {
    super(resource);
  }

  /**
   * @override
   */
  restoreContent(): AssetPromise<TextureCube> {
    return new AssetPromise((resolve, reject) => {
      Promise.all(this.urls.map((url) => request<HTMLImageElement>(url, this.requestConfig)))
        .then((images) => {
          const resource = this.resource;
          for (let faceIndex = 0; faceIndex < 6; faceIndex++) {
            resource.setImageSource(TextureCubeFace.PositiveX + faceIndex, images[faceIndex], 0);
          }
          resource.generateMipmaps();
          resolve(resource);
        })
        .catch((e) => {
          reject(e);
        });
    });
  }
}
