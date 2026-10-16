import type { SpineAtlas } from "./SpineAtlas";
import { readSpineVersion } from "./SpineVersion";
import { getSpineRuntime } from "../runtime/SpineRuntimeRegistry";
import { AssetPromise, Loader, LoadItem, resourceLoader, ResourceManager } from "@galacean/engine";
import { SpineResource } from "./SpineResource";

type SpineAssetPath = {
  atlasPath: string;
  skeletonPath: string;
  extraPaths: string[];
};

type SpineLoadContext = {
  spineAssetPath: SpineAssetPath;
  skeletonRawData: string | ArrayBuffer;
};

// Specify AssetType.JSON when loading plain JSON after registering this loader.
@resourceLoader("Spine", ["json", "bin", "skel"])
export class SpineLoader extends Loader<SpineResource> {
  private static _decoder = new TextDecoder("utf-8");

  private static _groupAssetsByExtension(url: string, assetPath: SpineAssetPath) {
    const ext = SpineLoader._getUrlExtension(url);
    if (!ext) return;

    if (["skel", "json", "bin"].includes(ext)) {
      assetPath.skeletonPath = url;
    } else if (ext === "atlas") {
      assetPath.atlasPath = url;
    } else {
      assetPath.extraPaths.push(url);
    }
  }

  private static _assignAssetPathsFromUrl(url: string, assetPath: SpineAssetPath, resourceManager: ResourceManager) {
    const ext = SpineLoader._getUrlExtension(url);
    if (!ext) return;
    assetPath.skeletonPath = url;
    const skeletonDependency = resourceManager?._virtualPathResourceMap?.[url]?.dependentAssetMap;
    if (skeletonDependency) {
      assetPath.atlasPath = skeletonDependency.atlas;
    } else {
      const extensionPattern: RegExp = /\.(json|bin|skel)$/;
      let baseUrl: string;
      if (extensionPattern.test(url)) {
        baseUrl = url.replace(extensionPattern, "");
      }
      if (baseUrl) {
        const atlasUrl = baseUrl + ".atlas";
        assetPath.atlasPath = atlasUrl;
      }
    }
  }

  static _getUrlExtension(url: string): string | null {
    const regex = /\.(\w+)(\?|$)/;
    const match = url.match(regex);
    return match ? match[1] : null;
  }

  load(item: LoadItem, resourceManager: ResourceManager): AssetPromise<SpineResource> {
    return new AssetPromise((resolve, reject) => {
      const spineLoadContext: SpineLoadContext = {
        skeletonRawData: "",
        spineAssetPath: {
          atlasPath: null,
          skeletonPath: null,
          extraPaths: []
        }
      };
      const { spineAssetPath } = spineLoadContext;
      if (!item.urls) {
        SpineLoader._assignAssetPathsFromUrl(item.url, spineAssetPath, resourceManager);
      } else {
        const urls = item.urls;
        for (let i = 0, len = urls.length; i < len; i += 1) {
          const url = urls[i];
          SpineLoader._groupAssetsByExtension(url, spineAssetPath);
        }
      }

      const { skeletonPath, atlasPath } = spineAssetPath;
      if (!skeletonPath || !atlasPath) {
        reject(
          new Error(
            "Failed to load spine assets. Please check the file path and ensure the file extension is included."
          )
        );
        return;
      }

      resourceManager
        ._request(skeletonPath, { type: "arraybuffer" })
        .then((skeletonRawData: ArrayBuffer) => {
          spineLoadContext.skeletonRawData = skeletonRawData;
          const skeletonString = SpineLoader._decoder.decode(skeletonRawData).trimStart();
          if (skeletonString.startsWith("{")) {
            spineLoadContext.skeletonRawData = skeletonString;
          }
          return this._loadAndCreateSpineResource(spineLoadContext, resourceManager);
        })
        .then(resolve)
        .catch(reject);
    });
  }

  private _loadAndCreateSpineResource(
    spineLoadContext: SpineLoadContext,
    resourceManager: ResourceManager
  ): AssetPromise<SpineResource> {
    const { engine } = resourceManager;
    const { skeletonRawData, spineAssetPath } = spineLoadContext;
    const { skeletonPath, atlasPath, extraPaths } = spineAssetPath;

    const runtime = getSpineRuntime(readSpineVersion(skeletonRawData));
    const atlasLoadPromise =
      extraPaths.length === 0
        ? resourceManager.load<SpineAtlas>({
            url: atlasPath,
            type: "SpineAtlas"
          })
        : resourceManager.load<SpineAtlas>({
            urls: [atlasPath].concat(extraPaths),
            type: "SpineAtlas"
          });

    return atlasLoadPromise.then((atlas) => {
      const textureAtlas = runtime.createTextureAtlas(atlas.text, Array.from(atlas.textures));
      const skeletonData = runtime.createSkeletonData(skeletonRawData, textureAtlas, 0.01);
      return SpineResource._create(engine, skeletonData, skeletonPath);
    });
  }
}
