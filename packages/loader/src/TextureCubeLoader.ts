import {
  AssetPromise,
  AssetType,
  LoadItem,
  Loader,
  RequestConfig,
  ResourceManager,
  TextureCube,
  TextureCubeFace,
  resourceLoader
} from "@galacean/engine-core";
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

      // @ts-ignore
      Promise.all(urls.map((url) => resourceManager._request<HTMLImageElement>(url, requestConfig)))
        .then((images) => {
          const { width, height } = images[0];

          if (width !== height) {
            console.error("The cube texture must have the same width and height");
            return;
          }

          const texture = new TextureCube(
            resourceManager.engine,
            width,
            undefined,
            undefined,
            item.params?.isSRGBColorSpace ?? false
          );
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
