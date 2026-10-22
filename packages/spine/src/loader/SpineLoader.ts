import { LoaderUtils } from "./LoaderUtils";
import { readSpineVersion } from "./SpineVersion";
import type { ISpineRuntime } from "../runtime/ISpineRuntime";
import {
  AssetPromise,
  Engine,
  EngineConfiguration,
  Loader,
  LoadItem,
  resourceLoader,
  ResourceManager
} from "@galacean/engine";
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

// Specify type: "Spine" when loading Spine assets with .json or .bin extensions.
@resourceLoader("Spine", ["skel"])
export class SpineLoader extends Loader<SpineResource> {
  private static _decoder = new TextDecoder("utf-8");

  private _runtimes = new WeakMap<Engine, Map<string, ISpineRuntime>>();

  static _getUrlExtension(url: string): string | null {
    const match = SpineLoader._getUrlPath(url).match(/\.(\w+)$/);
    return match ? match[1] : null;
  }

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

  private static _getUrlPath(url: string): string {
    return url.split(/[?#]/, 1)[0];
  }

  override initialize(engine: Engine, configuration: EngineConfiguration): void {
    if (configuration.spine) {
      this._registerRuntime(engine, configuration.spine);
    }
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

  /** @internal */
  _registerRuntime(engine: Engine, runtime: ISpineRuntime): void {
    if (!/^\d+\.\d+$/.test(runtime.version)) {
      throw new Error(`Invalid Spine runtime version: ${runtime.version}`);
    }
    let engineRuntimes = this._runtimes.get(engine);
    if (engineRuntimes?.has(runtime.version)) {
      return;
    }
    if (!engineRuntimes) {
      engineRuntimes = new Map();
      this._runtimes.set(engine, engineRuntimes);
    }
    engineRuntimes.set(runtime.version, runtime);
  }

  private _getRuntime(engine: Engine, version: string | null | undefined): ISpineRuntime {
    const majorMinor = /^(\d+\.\d+)(?:\.|$)/.exec(version ?? "")?.[1];
    const runtime = this._runtimes.get(engine)?.get(majorMinor);
    if (!runtime) {
      throw new Error(
        `No Spine runtime registered for asset version "${version}" on this engine. ` +
          "Pass a matching backend through the spine option when creating the engine."
      );
    }
    return runtime;
  }

  private _loadAndCreateSpineResource(
    spineLoadContext: SpineLoadContext,
    resourceManager: ResourceManager
  ): Promise<SpineResource> {
    const { engine } = resourceManager;
    const { skeletonRawData, spineAssetPath } = spineLoadContext;
    const { skeletonPath, atlasPath, extraPaths } = spineAssetPath;

    const runtime = this._getRuntime(engine, readSpineVersion(skeletonRawData));
    return LoaderUtils.loadAtlas(atlasPath, extraPaths, resourceManager).then((atlas) => {
      const textureAtlas = runtime.createTextureAtlas(atlas.text, atlas.textures);
      const skeletonData = runtime.createSkeletonData(skeletonRawData, textureAtlas, 0.01);
      return SpineResource._create(engine, runtime, skeletonData, skeletonPath);
    });
  }
}

declare module "@galacean/engine" {
  interface EngineConfiguration {
    /** Initial Spine backend. Import engine-spine before creating the engine. */
    spine?: ISpineRuntime;
  }
}
