import type { TextureAtlas } from "@esotericsoftware/spine-core";
import { AssetPromise, Loader, LoadItem, resourceLoader, ResourceManager } from "@galacean/engine";
import { LoaderUtils } from "./LoaderUtils";
import { SpineResource } from "./SpineResource";

type SpineAssetPath = {
  atlasPath: string;
  skeletonPath: string;
  extraPaths: string[];
  fileExtensions?: string | string[];
};

type SpineLoadContext = {
  fileName: string;
  spineAssetPath: SpineAssetPath;
  skeletonRawData: string | ArrayBuffer;
};

export type SpineLoaderParams = {
  fileExtensions?: string | string[];
};

// Registering "json" makes this loader the default for bare `.json` urls (extension mappings are
// last-registration-wins, overriding the core JSONLoader) — matches the historical engine-spine
// behavior. Pass an explicit `type` (e.g. AssetType.JSON) to load plain JSON once this package
// is imported.
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

    // @ts-ignore
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
        fileName: "",
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
        // @ts-ignore
        ._request(skeletonPath, { type: "arraybuffer" })
        .then((skeletonRawData: ArrayBuffer) => {
          spineLoadContext.skeletonRawData = skeletonRawData;
          const skeletonString = SpineLoader._decoder.decode(skeletonRawData);
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
  ): Promise<SpineResource> {
    const { engine } = resourceManager;
    const { skeletonRawData, spineAssetPath } = spineLoadContext;
    const { skeletonPath, atlasPath, extraPaths } = spineAssetPath;

    const atlasLoadPromise =
      extraPaths.length === 0
        ? (resourceManager.load({
            url: atlasPath,
            type: "SpineAtlas"
          }) as unknown as Promise<TextureAtlas>)
        : (resourceManager.load({
            urls: [atlasPath].concat(extraPaths),
            type: "SpineAtlas"
          }) as unknown as Promise<TextureAtlas>);

    return atlasLoadPromise.then((textureAtlas) => {
      const skeletonData = LoaderUtils.createSkeletonData(skeletonRawData, textureAtlas, 0.01);
      return new SpineResource(engine, skeletonData, skeletonPath);
    });
  }
}
