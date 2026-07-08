import type { TextureAtlas } from "@esotericsoftware/spine-core";
import { AssetPromise, Loader, LoadItem, resourceLoader, ResourceManager } from "@galacean/engine";
import { LoaderUtils } from "./LoaderUtils";
import { SpineLoader } from "./SpineLoader";

interface SpineAtlasAsset {
  atlasPath: string;
  imagePaths?: string[];
  imageExtensions?: string[];
}

@resourceLoader("SpineAtlas", ["atlas"], false)
export class SpineAtlasLoader extends Loader<TextureAtlas> {
  private static _groupAssetsByExtension(url: string, assetPath: SpineAtlasAsset, resourceManager: ResourceManager) {
    let ext = SpineLoader._getUrlExtension(url);
    if (!ext) return;

    if (ext === "atlas") {
      assetPath.atlasPath = url;
    }
    if (["png", "jpg", "webp", "jpeg", "ktx", "ktx2"].includes(ext)) {
      assetPath.imagePaths.push(url);
    }
  }

  private static _assignAssetPathsFromUrl(url: string, assetPath: SpineAtlasAsset, resourceManager: ResourceManager) {
    const ext = SpineLoader._getUrlExtension(url);
    if (ext === "atlas") {
      assetPath.atlasPath = url;
      // @ts-ignore
      const atlasDependency = resourceManager?._virtualPathResourceMap?.[url]?.dependentAssetMap;
      if (atlasDependency) {
        for (let key in atlasDependency) {
          const imageVirtualPath = atlasDependency[key];
          assetPath.imagePaths.push(imageVirtualPath);
        }
      }
    }
  }

  load(item: LoadItem, resourceManager: ResourceManager): AssetPromise<TextureAtlas> {
    return new AssetPromise((resolve, reject) => {
      const engine = resourceManager.engine;
      const spineAtlasAsset = {
        atlasPath: "",
        imagePaths: [],
        imageExtensions: []
      };

      if (!item.urls) {
        SpineAtlasLoader._assignAssetPathsFromUrl(item.url, spineAtlasAsset, resourceManager);
      } else {
        const urls = item.urls;
        for (let i = 0, len = urls.length; i < len; i += 1) {
          const url = urls[i];
          SpineAtlasLoader._groupAssetsByExtension(url, spineAtlasAsset, resourceManager);
        }
      }

      const { atlasPath } = spineAtlasAsset;
      if (!atlasPath) {
        reject(
          new Error("Failed to load spine atlas. Please check the file path and ensure the file extension is included.")
        );
        return;
      }

      const imagePaths = spineAtlasAsset.imagePaths;
      if (imagePaths.length === 0) {
        const atlasPath = item.url;
        LoaderUtils.loadTextureAtlas(atlasPath, engine, reject)
          .then((textureAtlas) => {
            resolve(textureAtlas);
          })
          .catch((err) => {
            reject(err);
          });
      } else {
        const { atlasPath, imagePaths, imageExtensions } = spineAtlasAsset;
        if (imagePaths.length > 0) {
          Promise.all([
            // @ts-ignore
            resourceManager._request(atlasPath, {
              type: "text"
            }) as Promise<string>,
            LoaderUtils.loadTexturesByPaths(imagePaths, imageExtensions, engine, reject)
          ])
            .then(([atlasText, textures]) => {
              const textureAtlas = LoaderUtils.createTextureAtlas(atlasText, textures);
              resolve(textureAtlas);
            })
            .catch((err) => {
              reject(err);
            });
        } else {
          LoaderUtils.loadTextureAtlas(atlasPath, engine, reject)
            .then((textureAtlas) => {
              resolve(textureAtlas);
            })
            .catch((err) => {
              reject(err);
            });
        }
      }
    });
  }
}
