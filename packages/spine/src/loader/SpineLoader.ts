import { LoaderUtils } from "./LoaderUtils";
import { readSpineVersion } from "./SpineVersion";
import { getSpineRuntime } from "../runtime/SpineRuntimeRegistry";
import { AssetPromise, Loader, LoadItem, resourceLoader, ResourceManager } from "@galacean/engine";
import { SpineResource } from "./SpineResource";

/** Parameters for loading a Spine asset. */
export interface SpineLoadParams {
  /**
   * Texture encoding override, for all atlas pages or by page name.
   * Unspecified pages use the atlas `pma` property (false when absent).
   * Configure this once per asset URL, before its first load.
   */
  alphaMode?: "straight" | "premultiplied" | Record<string, "straight" | "premultiplied">;
}

type SpineAssetPath = {
  atlasPath: string;
  skeletonPath: string;
  extraPaths: string[];
};

type SpineLoadContext = {
  spineAssetPath: SpineAssetPath;
  params?: SpineLoadParams;
  skeletonRawData: string | ArrayBuffer;
};

// Specify type: "Spine" when loading Spine assets with .json or .bin extensions.
@resourceLoader("Spine", ["skel"])
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
      const path = SpineLoader._getUrlPath(url);
      const extensionPattern: RegExp = /\.(json|bin|skel)$/;
      if (extensionPattern.test(path)) {
        assetPath.atlasPath = path.replace(extensionPattern, ".atlas");
      }
    }
  }

  static _getUrlExtension(url: string): string | null {
    const match = SpineLoader._getUrlPath(url).match(/\.(\w+)$/);
    return match ? match[1] : null;
  }

  private static _getUrlPath(url: string): string {
    return url.split(/[?#]/, 1)[0];
  }

  load(item: LoadItem, resourceManager: ResourceManager): AssetPromise<SpineResource> {
    return new AssetPromise((resolve, reject) => {
      const spineLoadContext: SpineLoadContext = {
        skeletonRawData: "",
        params: item.params,
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
  ): Promise<SpineResource> {
    const { engine } = resourceManager;
    const { skeletonRawData, spineAssetPath, params } = spineLoadContext;
    const { skeletonPath, atlasPath, extraPaths } = spineAssetPath;

    const runtime = getSpineRuntime(readSpineVersion(skeletonRawData));
    return LoaderUtils.loadAtlas(atlasPath, extraPaths, resourceManager, params).then((atlas) => {
      const textureAtlas = runtime.createTextureAtlas(atlas.text, atlas.textures);
      const skeletonData = runtime.createSkeletonData(skeletonRawData, textureAtlas, 0.01);
      return SpineResource._create(engine, runtime, skeletonData, skeletonPath);
    });
  }
}
