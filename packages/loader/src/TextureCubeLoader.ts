import {
  AssetPromise,
  AssetType,
  LoadItem,
  Loader,
  RequestConfig,
  ResourceManager,
  TextureCube,
  TextureCubeFace,
  TextureUtils,
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
          const { format, anisoLevel, wrapModeU, wrapModeV, filterMode, isSRGBColorSpace, mipmap } = item.params ?? {};
          const { width, height } = images[0];
          // @ts-ignore
          const isWebGL2 = resourceManager.engine._hardwareRenderer._isWebGL2;

          if (width !== height) {
            console.error("The cube texture must have the same width and height");
            return;
          }

          const generateMipmap = TextureUtils.supportGenerateMipmapsWithCorrection(
            width,
            height,
            format,
            mipmap,
            isSRGBColorSpace,
            isWebGL2
          );

          const texture = new TextureCube(resourceManager.engine, width, format, generateMipmap, isSRGBColorSpace);

          texture.anisoLevel = anisoLevel ?? texture.anisoLevel;
          texture.filterMode = filterMode ?? texture.filterMode;
          texture.wrapModeU = wrapModeU ?? texture.wrapModeU;
          texture.wrapModeV = wrapModeV ?? texture.wrapModeV;

          for (let faceIndex = 0; faceIndex < 6; faceIndex++) {
            texture.setImageSource(TextureCubeFace.PositiveX + faceIndex, images[faceIndex], 0);
          }
          generateMipmap && texture.generateMipmaps();

          resourceManager.addContentRestorer(new TextureCubeContentRestorer(texture, urls, requestConfig));
          resolve(texture);
        })
        .catch((e) => {
          reject(e);
        });
    });
  }
}
