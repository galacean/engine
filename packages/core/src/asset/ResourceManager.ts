import { AssetPromise } from "./AssetPromise";
import { LoadItem } from "./LoadItem";
import { RefObject } from "./RefObject";
import { Engine } from "..";
import { Loader } from "./Loader";
import { AssetType } from "./AssetType";
import { ObjectValues } from "../base/Util";

/**
 * ResourceManager
 */
export class ResourceManager {
  /** Loader collection. */
  private static _loaders: { [key: number]: Loader<any> } = {};
  private static _extTypeMapping: { [key: string]: AssetType } = {};

  /**
   * @internal
   */
  static _addLoader(type: AssetType, loader: Loader<any>, extnames: string[]) {
    this._loaders[type] = loader;
    for (let i = 0, len = extnames.length; i < len; i++) {
      this._extTypeMapping[extnames[i]] = type;
    }
  }

  private static _getTypeByUrl(url: string): AssetType {
    const path = url.split("?")[0];
    return this._extTypeMapping[path.substring(path.lastIndexOf(".") + 1)];
  }

  /** The number of retries after failing to load assets. */
  retryCount: number = 1;
  /** Retry delay time after failed to load assets, in milliseconds. */
  retryInterval: number = 0;
  /** The default timeout period for loading assets, in milliseconds. */
  timeout: number = 20000;

  /** Asset path pool, key is asset ID, value is asset path */
  private _assetPool: { [key: number]: string } = Object.create(null);
  /** Asset pool, the key is the asset path and the value is the asset. */
  private _assetUrlPool: { [key: string]: Object } = Object.create(null);
  /** Reference counted object pool, key is the object ID, and reference counted objects are put into this pool. */
  private _refObjectPool: { [key: number]: RefObject } = Object.create(null);
  /** Loading assets. */
  private _loadingPromises: { [url: string]: AssetPromise<any> } = {};
  /** Root directory of loader. */
  baseUrl: string = ""

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
    const objects = ObjectValues(this._refObjectPool);
    for (let i = 0, len = objects.length; i < len; i++) {
      if (!objects[i].isGCIgnored) {
        objects[i].destroy();
      }
    }
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
  _addAsset(path: string, asset: RefObject): void {
    this._assetPool[asset.instanceId] = path;
    this._assetUrlPool[path] = asset;
  }

  /**
   * @internal
   */
  _deleteAsset(asset: RefObject): void {
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

  private _loadSingleItem<T>(item: LoadItem | string): AssetPromise<T> {
    const info = this._assignDefaultOptions(typeof item === "string" ? { url: item } : item);
    const url = info.url;
    // has cache
    if (this._assetUrlPool[url]) {
      return new AssetPromise((resolve) => {
        resolve(this._assetUrlPool[url] as T);
      });
    }
    // loading
    if (this._loadingPromises[url]) {
      return this._loadingPromises[info.url];
    }
    const loader = ResourceManager._loaders[info.type];
    const promise = loader.load(info, this);
    this._loadingPromises[url] = promise;
    promise
      .then((res) => {
        if (loader.useCache) this._addAsset(url, res);
        delete this._loadingPromises[url];
      })
      .catch(() => {});
    return promise;
  }
}

/**
 * Declare ResourceLoader's decorator.
 * @param assetType - Type of asset
 * @param extnames - Name of file extension
 */
export function resourceLoader(assetType: AssetType, extnames: string[], useCache: boolean = true) {
  return <T extends Loader<any>>(Target: { new (useCache: boolean): T }) => {
    const loader = new Target(useCache);
    ResourceManager._addLoader(assetType, loader, extnames);
  };
}
