import {
  AssetPromise,
  AssetType,
  Loader,
  LoadItem,
  resourceLoader,
  ResourceManager,
  TextureCube,
  TextureCubeFace
} from "@galacean/engine-core";
import { RequestConfig } from "@galacean/engine-core/types/asset/request";
import { TextureCubeContentRestorer } from "./TextureCubeContentRestorer";

@resourceLoader(AssetType.TextureCube, [""])
class TextureCubeLoader extends Loader<TextureCube> {
  override load(item: LoadItem, resourceManager: ResourceManager): AssetPromise<TextureCube> {
    return new AssetPromise((resolve, reject) => {
      const urls = item.urls;
      const requestConfig = <RequestConfig>{
        ...item,
        type: "image"
      };

      Promise.all(urls.map((url) => resourceManager.request<HTMLImageElement>(url, requestConfig)))
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
