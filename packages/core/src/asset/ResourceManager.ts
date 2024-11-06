import { ContentRestorer, Engine, EngineObject, Logger, Utils } from "..";
import { AssetPromise } from "./AssetPromise";
import { GraphicsResource } from "./GraphicsResource";
import { Loader } from "./Loader";
import { LoadItem } from "./LoadItem";
import { ReferResource } from "./ReferResource";

/**
 * ResourceManager
 */
export class ResourceManager {
  /** @internal */
  static _loaders: { [key: string]: Loader<any> } = {};
  private static _extTypeMapping: { [key: string]: string } = {};

  /**
   * @internal
   */
  static _addLoader(type: string, loader: Loader<any>, extNames: string[]) {
    this._loaders[type] = loader;
    for (let i = 0, len = extNames.length; i < len; i++) {
      this._extTypeMapping[extNames[i].toLowerCase()] = type;
    }
  }

  private static _getTypeByUrl(url: string): string {
    const path = url.split("?")[0];
    return this._extTypeMapping[path.substring(path.lastIndexOf(".") + 1).toLowerCase()];
  }

  /** The number of retries after failing to load assets. */
  retryCount: number = 1;
  /** Retry delay time after failed to load assets, in milliseconds. */
  retryInterval: number = 0;
  /** The default timeout period for loading assets, in milliseconds. */
  timeout: number = Infinity;
  /** Base url for loading assets. */
  baseUrl: string | null = null;

  private _loadingPromises: Record<string, AssetPromise<any>> = {};

  /** Asset path pool, key is the `instanceID` of resource, value is asset path. */
  private _assetPool: Record<number, string> = Object.create(null);
  /** Asset url pool, key is the asset path and the value is the asset. */
  private _assetUrlPool: Record<string, Object> = Object.create(null);

  /** Referable resource pool, key is the `instanceID` of resource. */
  private _referResourcePool: Record<number, ReferResource> = Object.create(null);
  /** Graphic resource pool, key is the `instanceID` of resource. */
  private _graphicResourcePool: Record<number, GraphicsResource> = Object.create(null);
  /** Restorable resource information pool, key is the `instanceID` of resource. */
  private _contentRestorerPool: Record<number, ContentRestorer<any>> = Object.create(null);
  private _subAssetPromiseCallbacks: SubAssetPromiseCallbacks<any> = {};

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
   * Get the resource from cache by asset url, return the resource object if it loaded, otherwise return null.
   * @param url - Resource url
   * @returns Resource object
   */
  getFromCache<T>(url: string): T {
    return (this._assetUrlPool[url] as T) ?? null;
  }

  /**
   * Find the resource by type.
   * @param type - Resource type
   * @returns - Resource collection
   */
  findResourcesByType<T extends EngineObject>(type: new (...args) => T): T[] {
    const resources = new Array<T>();
    const referResourcePool = this._referResourcePool;
    for (const k in referResourcePool) {
      const resource = referResourcePool[k];
      if (resource instanceof type) {
        resources.push(resource);
      }
    }
    return resources;
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
      Utils.objectValues(this._loadingPromises).forEach((promise) => {
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
    this.engine._pendingGC();
  }

  /**
   * Add content restorer.
   * @param restorer - The restorer
   */
  addContentRestorer<T extends EngineObject>(restorer: ContentRestorer<T>): void {
    this._contentRestorerPool[restorer.resource.instanceId] = restorer;
  }

  /**
   * @internal
   */
  _onSubAssetSuccess<T>(assetBaseURL: string, assetSubPath: string, value: T): void {
    const subPromiseCallback = this._subAssetPromiseCallbacks[assetBaseURL]?.[assetSubPath];
    if (subPromiseCallback) {
      subPromiseCallback.resolve(value);
    } else {
      // Pending
      (this._subAssetPromiseCallbacks[assetBaseURL] ||= {})[assetSubPath] = {
        resolvedValue: value
      };
    }
  }

  /**
   * @internal
   */
  _onSubAssetFail(assetBaseURL: string, assetSubPath: string, value: Error): void {
    const subPromiseCallback = this._subAssetPromiseCallbacks[assetBaseURL]?.[assetSubPath];
    if (subPromiseCallback) {
      subPromiseCallback.reject(value);
    } else {
      // Pending
      (this._subAssetPromiseCallbacks[assetBaseURL] ||= {})[assetSubPath] = {
        rejectedValue: value
      };
    }
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
  _addReferResource(resource: ReferResource): void {
    this._referResourcePool[resource.instanceId] = resource;
  }

  /**
   * @internal
   */
  _deleteReferResource(resource: EngineObject): void {
    delete this._referResourcePool[resource.instanceId];
  }

  /**
   * @internal
   */
  _addGraphicResource(resource: GraphicsResource): void {
    this._graphicResourcePool[resource.instanceId] = resource;
  }

  /**
   * @internal
   */
  _deleteGraphicResource(resource: EngineObject): void {
    delete this._graphicResourcePool[resource.instanceId];
  }

  /**
   * @internal
   */
  _deleteContentRestorer(resource: EngineObject): void {
    delete this._contentRestorerPool[resource.instanceId];
  }

  /**
   * @internal
   */
  _restoreGraphicResources(): void {
    const graphicResourcePool = this._graphicResourcePool;
    for (const id in graphicResourcePool) {
      graphicResourcePool[id]._rebuild();
    }
  }

  /**
   * @internal
   */
  _lostGraphicResources(): void {
    const graphicResourcePool = this._graphicResourcePool;
    for (const id in graphicResourcePool) {
      graphicResourcePool[id]._isContentLost = true;
    }
  }

  /**
   * @internal
   */
  _restoreResourcesContent(): Promise<void[]> {
    const restoreContentInfoPool = this._contentRestorerPool;
    const restorePromises = new Array<Promise<void>>();
    for (const k in restoreContentInfoPool) {
      const restoreInfo = restoreContentInfoPool[k];
      const promise = restoreInfo.restoreContent();
      promise && restorePromises.push(promise);
    }
    return Promise.all(restorePromises);
  }

  /**
   * @internal
   */
  _destroy(): void {
    this.cancelNotLoaded();
    this._gc(true);
    this._assetPool = null;
    this._assetUrlPool = null;
    this._referResourcePool = null;
    this._graphicResourcePool = null;
    this._contentRestorerPool = null;
    this._loadingPromises = null;
  }

  private _assignDefaultOptions(assetInfo: LoadItem): LoadItem {
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

    // Check url mapping
    const itemURL = item.url;
    let url = this._virtualPathMap[itemURL] ?? itemURL;

    // Not absolute and base url is set
    if (!Utils.isAbsoluteUrl(url) && this.baseUrl) url = Utils.resolveAbsoluteUrl(this.baseUrl, url);

    // Parse url
    const { assetBaseURL, queryPath } = this._parseURL(url);
    const paths = queryPath ? this._parseQueryPath(queryPath) : [];

    // Check cache
    const cacheObject = this._assetUrlPool[assetBaseURL];
    if (cacheObject) {
      return new AssetPromise((resolve) => {
        resolve(this._getResolveResource(cacheObject, paths) as T);
      });
    }

    // Get asset url
    let assetURL = assetBaseURL;
    if (queryPath) {
      assetURL += "?q=" + paths.shift();
      let index: string;
      while ((index = paths.shift())) {
        assetURL += `[${index}]`;
      }
    }

    // Check is loading
    const loadingPromises = this._loadingPromises;
    const loadingPromise = loadingPromises[assetURL];
    if (loadingPromise) {
      return new AssetPromise((resolve, reject, setTaskCompleteProgress, setTaskDetailProgress) => {
        loadingPromise
          .onProgress(setTaskCompleteProgress, setTaskDetailProgress)
          .then((resource: EngineObject) => {
            resolve(resource as T);
          })
          .catch((error: Error) => {
            reject(error);
          });
      });
    }

    // Check loader
    const loader = <Loader<T>>ResourceManager._loaders[item.type];
    if (!loader) {
      throw `loader not found: ${item.type}`;
    }

    // Check sub asset
    if (queryPath) {
      // Check whether load main asset
      const mainPromise = loadingPromises[assetBaseURL] || this._loadMainAsset(loader, item, assetBaseURL);
      mainPromise.catch((e) => {
        this._onSubAssetFail(assetBaseURL, queryPath, e);
      });

      return this._createSubAssetPromiseCallback<T>(assetBaseURL, assetURL, queryPath);
    }

    return this._loadMainAsset(loader, item, assetBaseURL);
  }

  private _loadMainAsset<T>(loader: Loader<T>, item: LoadItem, assetBaseURL: string): AssetPromise<T> {
    // item.url = assetBaseURL;
    const loadingPromises = this._loadingPromises;
    const promise = loader.load(item, this);
    loadingPromises[assetBaseURL] = promise;

    promise.then(
      (resource: T) => {
        if (loader.useCache) {
          this._addAsset(assetBaseURL, resource as EngineObject);
        }
        delete loadingPromises[assetBaseURL];
        this._releaseSubAssetPromiseCallback(assetBaseURL);
      },
      () => {
        delete loadingPromises[assetBaseURL];
        this._releaseSubAssetPromiseCallback(assetBaseURL);
      }
    );

    return promise;
  }

  private _createSubAssetPromiseCallback<T>(
    assetBaseURL: string,
    assetURL: string,
    assetSubPath: string
  ): AssetPromise<T> {
    const loadingPromises = this._loadingPromises;
    const subPromiseCallback = this._subAssetPromiseCallbacks[assetBaseURL]?.[assetSubPath];
    const resolvedValue = subPromiseCallback?.resolvedValue;
    const rejectedValue = subPromiseCallback?.rejectedValue;

    // Already resolved or rejected
    if (resolvedValue || rejectedValue) {
      return new AssetPromise<T>((resolve, reject) => {
        if (resolvedValue) {
          resolve(resolvedValue);
        } else if (rejectedValue) {
          reject(rejectedValue);
        }
      });
    }

    // Pending
    const promise = new AssetPromise<T>((resolve, reject) => {
      (this._subAssetPromiseCallbacks[assetBaseURL] ||= {})[assetSubPath] = {
        resolve,
        reject
      };
    });

    loadingPromises[assetURL] = promise;

    promise.then(
      () => {
        delete loadingPromises[assetURL];
      },
      () => delete loadingPromises[assetURL]
    );

    return promise;
  }

  private _gc(forceDestroy: boolean): void {
    const objects = <ReferResource[]>Utils.objectValues(this._referResourcePool);
    for (let i = 0, n = objects.length; i < n; i++) {
      const object = objects[i];
      if (!object.isGCIgnored || forceDestroy) {
        object.destroy(forceDestroy, true);
      }
    }
  }

  private _getResolveResource(resource: any, paths: string[]): any {
    let subResource = resource;
    if (paths) {
      for (let i = 0, n = paths.length; i < n; i++) {
        const path = paths[i];
        subResource = subResource[path];
      }
    }
    return subResource;
  }

  private _parseURL(path: string): { assetBaseURL: string; queryPath: string } {
    const [baseUrl, searchStr] = path.split("?");
    let queryPath = undefined;
    let assetBaseURL = baseUrl;
    if (searchStr) {
      const params = searchStr.split("&");
      for (let i = 0; i < params.length; i++) {
        const param = params[i];
        if (param.startsWith(`q=`)) {
          queryPath = decodeURIComponent(param.split("=")[1]);
          params.splice(i, 1);
          break;
        }
      }
      assetBaseURL = params.length > 0 ? baseUrl + "?" + params.join("&") : baseUrl;
    }
    return { assetBaseURL, queryPath };
  }

  private _parseQueryPath(string): string[] {
    const result = [];
    if (string.charCodeAt(0) === charCodeOfDot) {
      result.push("");
    }
    string.replace(rePropName, (match, expression, quote, subString) => {
      let key = match;
      if (quote) {
        key = subString.replace(reEscapeChar, "$1");
      } else if (expression) {
        key = expression.trim();
      }
      result.push(key);
    });
    return result;
  }

  private _releaseSubAssetPromiseCallback(assetBaseURL: string): void {
    delete this._subAssetPromiseCallbacks[assetBaseURL];
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
      const resourceConfig = this._editorResourceConfig[refId];
      promise = this.load<any>({
        url: resourceConfig.virtualPath,
        type: resourceConfig.type
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
 * @param extNames - Name of file extension
 */
export function resourceLoader(assetType: string, extNames: string[], useCache: boolean = true) {
  return <T extends Loader<any>>(Target: { new (useCache: boolean): T }) => {
    const loader = new Target(useCache);
    ResourceManager._addLoader(assetType, loader, extNames);
  };
}

const charCodeOfDot = ".".charCodeAt(0);
const reEscapeChar = /\\(\\)?/g;
const rePropName = RegExp(
  // Match anything that isn't a dot or bracket.
  "[^.[\\]]+" +
    "|" +
    // Or match property names within brackets.
    "\\[(?:" +
    // Match a non-string expression.
    "([^\"'][^[]*)" +
    "|" +
    // Or match strings (supports escaping characters).
    "([\"'])((?:(?!\\2)[^\\\\]|\\\\.)*?)\\2" +
    ")\\]" +
    "|" +
    // Or match "" as the space between consecutive dots or empty brackets.
    "(?=(?:\\.|\\[\\])(?:\\.|\\[\\]|$))",
  "g"
);

type EditorResourceItem = { virtualPath: string; path: string; type: string; id: string };
type EditorResourceConfig = Record<string, EditorResourceItem>;
type SubAssetPromiseCallbacks<T> = Record<
  // main asset url, ie. "https://***.glb"
  string,
  Record<
    // sub asset url, ie. "textures[0]"
    string,
    {
      // Already resolved or rejected
      resolvedValue?: T;
      rejectedValue?: Error;
      // Pending
      resolve?: (value: T) => void;
      reject?: (reason: any) => void;
    }
  >
>;
