import { Engine, EngineObject, Logger } from "..";
import { ObjectValues } from "../base/Util";
import { AssetPromise } from "./AssetPromise";
import { Loader } from "./Loader";
import { LoadItem } from "./LoadItem";
import { RefObject } from "./RefObject";

/**
 * ResourceManager
 */
export class ResourceManager {
  /** Loader collection. */
  private static _loaders: { [key: number]: Loader<any> } = {};
  private static _subAssetFilters: { [key: number]: Loader<any> } = {};
  private static _extTypeMapping: { [key: string]: string } = {};

  /**
   * @internal
   */
  static _addLoader(
    type: string,
    loader: Loader<any>,
    extNames: string[],
    subAssetFilter: (resource: EngineObject, query: string) => any
  ) {
    this._loaders[type] = loader;
    this._subAssetFilters[type] = subAssetFilter;
    for (let i = 0, len = extNames.length; i < len; i++) {
      this._extTypeMapping[extNames[i]] = type;
    }
  }

  private static _getTypeByUrl(url: string): string {
    const path = url.split("?")[0];
    return this._extTypeMapping[path.substring(path.lastIndexOf(".") + 1)];
  }

  /** The number of retries after failing to load assets. */
  retryCount: number = 1;
  /** Retry delay time after failed to load assets, in milliseconds. */
  retryInterval: number = 0;
  /** The default timeout period for loading assets, in milliseconds. */
  timeout: number = Infinity;

  /** Asset path pool, key is asset ID, value is asset path */
  private _assetPool: { [key: number]: string } = Object.create(null);
  /** Asset pool, the key is the asset path and the value is the asset. */
  private _assetUrlPool: { [key: string]: Object } = Object.create(null);
  /** Reference counted object pool, key is the object ID, and reference counted objects are put into this pool. */
  private _refObjectPool: { [key: number]: RefObject } = Object.create(null);
  /** Loading promises. */
  private _loadingPromises: { [url: string]: AssetPromise<any> | Record<string, AssetPromise<any>> } = {};

  /**
   * Create a ResourceManager.
   * @param engine - Engine to which the current ResourceManager belongs
   */
  constructor(public readonly engine: Engine) {}

  /**
   * Load asset asynchronously through the path.
   * @param path - Path
   * @returns Asset promise
   */
  load<T>(path: string): AssetPromise<T>;

  /**
   * Load asset collection asynchronously through urls.
   * @param paths - Path collections
   * @returns Asset Promise
   */
  load(paths: string[]): AssetPromise<Object[]>;

  /**
   * Load the asset asynchronously by asset item information.
   * @param assetItem - AssetItem
   * @returns AssetPromise
   */
  load<T>(assetItem: LoadItem): AssetPromise<T>;

  /**
   * Load the asset collection asynchronously by loading the information collection.
   * @param assetItems - Asset collection
   * @returns AssetPromise
   */
  load(assetItems: LoadItem[]): AssetPromise<Object[]>;

  load<T>(assetInfo: string | LoadItem | (LoadItem | string)[]): AssetPromise<T | Object[]> {
    // single item
    if (!Array.isArray(assetInfo)) {
      return this._loadSingleItem(assetInfo);
    }
    // multi items
    const promises = assetInfo.map((item) => this._loadSingleItem<T>(item));
    return AssetPromise.all(promises);
  }

  /**
   * Cancel all assets that have not finished loading.
   */
  cancelNotLoaded(): void;

  /**
   * Cancel assets whose url has not finished loading.
   * @param url - Resource url
   */
  cancelNotLoaded(url: string): void;

  /**
   * Cancel the incompletely loaded assets in urls.
   * @param urls - Resource urls
   */
  cancelNotLoaded(urls: string[]): void;

  cancelNotLoaded(url?: string | string[]): void {
    if (!url) {
      ObjectValues(this._loadingPromises).forEach((promise) => {
        promise.cancel();
      });
    } else if (typeof url === "string") {
      this._loadingPromises[url]?.cancel();
    } else {
      url.forEach((p) => {
        this._loadingPromises[p]?.cancel();
      });
    }
  }

  /**
   * Garbage collection will release resource objects managed by reference counting.
   * @remarks The release principle is that it is not referenced by the components, including direct and indirect reference.
   */
  gc(): void {
    this._gc(false);
  }

  /**
   * Get asset url from instanceId.
   * @param instanceId - Engine instance id
   * @returns Asset url
   */
  getAssetPath(instanceId: number): string {
    return this._assetPool[instanceId];
  }

  /**
   * @internal
   */
  _addAsset(path: string, asset: EngineObject): void {
    this._assetPool[asset.instanceId] = path;
    this._assetUrlPool[path] = asset;
  }

  /**
   * @internal
   */
  _deleteAsset(asset: EngineObject): void {
    const id = asset.instanceId;
    const path = this._assetPool[id];
    if (path) {
      delete this._assetPool[id];
      delete this._assetUrlPool[path];
    }
  }

  /**
   * @internal
   */
  _addRefObject(id: number, asset: RefObject): void {
    this._refObjectPool[id] = asset;
  }

  /**
   * @internal
   */
  _deleteRefObject(id: number): void {
    delete this._refObjectPool[id];
  }

  /**
   * @internal
   */
  _destroy(): void {
    this.cancelNotLoaded();
    this._gc(true);
    this._assetPool = null;
    this._assetUrlPool = null;
    this._refObjectPool = null;
    this._loadingPromises = null;
  }

  private _assignDefaultOptions(assetInfo: LoadItem): LoadItem | never {
    assetInfo.type = assetInfo.type ?? ResourceManager._getTypeByUrl(assetInfo.url);
    if (assetInfo.type === undefined) {
      throw `asset type should be specified: ${assetInfo.url}`;
    }
    assetInfo.retryCount = assetInfo.retryCount ?? this.retryCount;
    assetInfo.timeout = assetInfo.timeout ?? this.timeout;
    assetInfo.retryInterval = assetInfo.retryInterval ?? this.retryInterval;
    assetInfo.url = assetInfo.url ?? assetInfo.urls.join(",");
    return assetInfo;
  }

  private _loadSingleItem<T>(itemOrURL: LoadItem | string): AssetPromise<T> {
    const item = this._assignDefaultOptions(typeof itemOrURL === "string" ? { url: itemOrURL } : itemOrURL);
    const itemURL = item.url;
    const loadingPromises = this._loadingPromises;

    // Check url mapping
    const url = this._virtualPathMap[itemURL] ? this._virtualPathMap[itemURL] : itemURL;

    const { query, baseURL } = this._parseUrl(url);

    // Has cache
    if (this._assetUrlPool[baseURL]) {
      return new AssetPromise((resolve) => {
        const subAssetFilters = ResourceManager._subAssetFilters[item.type];
        if (subAssetFilters) {
          resolve(subAssetFilters(this._assetUrlPool[baseURL], query) as T);
        } else {
          resolve(this._assetUrlPool[baseURL] as T);
        }
      });
    }

    // Is loading
    if (loadingPromises[baseURL]) {
      return loadingPromises[baseURL];
    }

    // Check loader
    const loader = ResourceManager._loaders[item.type];
    if (!loader) {
      throw `loader not found: ${item.type}`;
    }
    // temp solution
    loader.query = query;

    item.url = baseURL;

    const promise = loader.load(item, this);
    loadingPromises[baseURL] = promise;
    promise
      .then((res: EngineObject) => {
        if (loader.useCache) {
          this._addAsset(baseURL, res);
        }
        if (loadingPromises) {
          delete loadingPromises[baseURL];
        }
      })
      .catch((err: Error) => {
        Promise.reject(err);
        if (loadingPromises) {
          delete loadingPromises[baseURL];
        }
      });
    return promise;
  }

  private _gc(forceDestroy: boolean): void {
    const objects = ObjectValues(this._refObjectPool);
    for (let i = 0, len = objects.length; i < len; i++) {
      if (!objects[i].isGCIgnored || forceDestroy) {
        objects[i].destroy();
      }
    }
  }

  private _parseUrl(path: string): { query: string; baseURL: string } {
    let baseURL = path;
    if (baseURL.indexOf("?") !== -1) {
      baseURL = baseURL.slice(0, path.indexOf("?"));
    }
    return { query: this._getParameterByName("q", path), baseURL: baseURL };
  }

  private _getParameterByName(name, url = window.location.href) {
    name = name.replace(/[\[\]]/g, "\\$&");
    var regex = new RegExp("[?&]" + name + "(=([^&#]*)|&|#|$)"),
      results = regex.exec(url);
    if (!results) return null;
    if (!results[2]) return "";
    return decodeURIComponent(results[2].replace(/\+/g, " "));
  }

  //-----------------Editor temp solution-----------------

  /** @internal */
  _objectPool: { [key: string]: any } = Object.create(null);
  /** @internal */
  _editorResourceConfig: EditorResourceConfig = Object.create(null);
  /** @internal */
  _virtualPathMap: Record<string, string> = Object.create(null);

  /**
   * @internal
   * @beta Just for internal editor, not recommended for developers.
   */
  getResourceByRef<T>(ref: { refId: string; key?: string; isClone?: boolean }): Promise<T> {
    const { refId, key, isClone } = ref;
    const obj = this._objectPool[refId];
    let promise;
    if (obj) {
      promise = Promise.resolve(obj);
    } else {
      let url = this._editorResourceConfig[refId]?.path;
      if (!url) {
        Logger.warn(`refId:${refId} is not find in this._editorResourceConfig.`);
        return Promise.resolve(null);
      }
      url = key ? `${url}${url.indexOf("?") > -1 ? "&" : "?"}q=${key}` : url;
      promise = this.load<any>({
        url,
        type: this._editorResourceConfig[refId].type
      });
    }
    return promise.then((item) => (isClone ? item.clone() : item));
  }

  /**
   * @internal
   * @beta Just for internal editor, not recommended for developers.
   */
  initVirtualResources(config: EditorResourceItem[]): void {
    config.forEach((element) => {
      this._virtualPathMap[element.virtualPath] = element.path;
      this._editorResourceConfig[element.id] = element;
    });
  }
  //-----------------Editor temp solution-----------------
}

/**
 * Declare ResourceLoader's decorator.
 * @param assetType - Type of asset
 * @param extnames - Name of file extension
 */
export function resourceLoader(
  assetType: string,
  extnames: string[],
  useCache: boolean = true,
  subAssetFilter?: (resource: EngineObject, query: string) => any
) {
  return <T extends Loader<any>>(Target: { new (useCache: boolean): T }) => {
    const loader = new Target(useCache);
    ResourceManager._addLoader(assetType, loader, extnames, subAssetFilter);
  };
}

type EditorResourceItem = { virtualPath: string; path: string; type: string; id: string };
type EditorResourceConfig = Record<string, EditorResourceItem>;
