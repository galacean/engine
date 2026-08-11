import { IClone } from "@galacean/engine-design";
import { ContentRestorer, Engine, EngineObject, Logger, Utils } from "..";
import { AssetPromise } from "./AssetPromise";
import { GraphicsResource } from "./GraphicsResource";
import { Loader } from "./Loader";
import { LoadItem } from "./LoadItem";
import { ReferResource } from "./ReferResource";
import { request, RequestConfig } from "./request";

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

  private static _getTypeByPath(assetPath: string): string {
    const path = assetPath.split("?")[0];
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

  /** Loaded asset paths indexed by resource instance ID. */
  private _assetPathById: Record<number, string> = Object.create(null);
  /** Loaded assets indexed by their logical asset path. */
  private _assetByPath: Record<string, object> = Object.create(null);

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
   * Load the asset asynchronously by asset item information.
   * @param assetItem - AssetItem
   * @returns AssetPromise
   */
  load<T extends EngineObject>(assetItem: LoadItem): AssetPromise<T>;

  /**
   * Load the asset collection asynchronously by loading the information collection.
   * @param assetItems - Asset collection
   * @returns AssetPromise
   */
  load<T extends EngineObject[]>(assetItems: LoadItem[]): AssetPromise<T>;

  /**
   * Load asset collection asynchronously through urls.
   * @param paths - Path collections
   * @returns Asset Promise
   */
  load<T extends EngineObject[]>(paths: string[]): AssetPromise<T>;

  /**
   * Load asset asynchronously through the path.
   * @param path - Path
   * @returns Asset promise
   */
  load<T extends EngineObject>(path: string): AssetPromise<T>;

  load<T>(assetInfo: string | LoadItem | (LoadItem | string)[]): AssetPromise<T | T[]> {
    // single item
    if (!Array.isArray(assetInfo)) {
      return this._loadSingleItem(assetInfo);
    }
    // multi items
    const promises = assetInfo.map((item) => this._loadSingleItem<T>(item));
    return AssetPromise.all(promises);
  }

  /**
   * Get the resource from cache by asset path, return the resource object if it loaded, otherwise return null.
   * @param path - Resource asset path
   * @returns Resource object
   */
  getFromCache<T>(path: string): T {
    return (this._assetByPath[path] as T) ?? null;
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
   * Get asset path from instanceId.
   * @param instanceId - Engine instance id
   * @returns Asset path
   */
  getAssetPath(instanceId: number): string {
    return this._assetPathById[instanceId];
  }

  /**
   * Cancel all assets that have not finished loading.
   */
  cancelNotLoaded(): void;

  /**
   * Cancel the asset whose path has not finished loading.
   * @param path - Resource asset path
   */
  cancelNotLoaded(path: string): void;

  /**
   * Cancel the incompletely loaded assets at the given paths.
   * @param paths - Resource asset paths
   */
  cancelNotLoaded(paths: string[]): void;

  cancelNotLoaded(path?: string | string[]): void {
    if (!path) {
      Utils.objectValues(this._loadingPromises).forEach((promise) => {
        promise.cancel();
      });
    } else if (typeof path === "string") {
      this._loadingPromises[path]?.cancel();
    } else {
      path.forEach((p) => {
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
    this.engine._renderTargetPool.gc();
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
   * Convert an asset path to the URL used by the transport layer.
   * @remarks This is the only boundary that reads the remote `path` from a virtual resource.
   * @internal
   */
  _getRequestUrl(assetPath: string): string {
    return this._virtualPathResourceMap[assetPath]?.path ?? assetPath;
  }

  /**
   * Resolve a reference in the asset namespace without converting it to a request URL.
   * @param baseAssetPath - Asset path of the file containing the reference.
   * @param referencePath - Complete asset path or a path relative to `baseAssetPath`.
   * @internal
   */
  _resolveAssetPath(baseAssetPath: string, referencePath: string): string {
    if (Utils.isAbsoluteUrl(referencePath) || Utils.isBase64Url(referencePath)) {
      return referencePath;
    }

    const relativeAssetPath = Utils.resolveAbsoluteUrl(baseAssetPath, referencePath);
    const resources = this._virtualPathResourceMap;

    // References are relative by default. Fall back to the original value only when the editor
    // registered it as an already-complete virtual path.
    return resources[relativeAssetPath] || !resources[referencePath] ? relativeAssetPath : referencePath;
  }

  /**
   * Request an asset by its logical path. The transport URL is intentionally resolved here, at
   * the last possible boundary.
   * @internal
   */
  _request<T>(assetPath: string, config: RequestConfig): AssetPromise<T> {
    return this._requestByUrl(this._getRequestUrl(assetPath), config);
  }

  private _requestByUrl<T>(requestUrl: string, config: RequestConfig): AssetPromise<T> {
    return request(requestUrl, config);
  }

  /**
   * @internal
   */
  _onSubAssetSuccess<T>(assetPath: string, assetSubPath: string, value: T): void {
    const subPromiseCallback = this._subAssetPromiseCallbacks[assetPath]?.[assetSubPath];
    if (subPromiseCallback) {
      subPromiseCallback.resolve(value);
    } else {
      // Pending
      (this._subAssetPromiseCallbacks[assetPath] ||= {})[assetSubPath] = {
        resolvedValue: value
      };
    }
  }

  /**
   * @internal
   */
  _addAsset(assetPath: string, asset: EngineObject): void {
    this._assetPathById[asset.instanceId] = assetPath;
    this._assetByPath[assetPath] = asset;
  }

  /**
   * @internal
   */
  _deleteAsset(asset: EngineObject): void {
    const id = asset.instanceId;
    const assetPath = this._assetPathById[id];
    if (assetPath) {
      delete this._assetPathById[id];
      delete this._assetByPath[assetPath];
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
    this._assetPathById = null;
    this._assetByPath = null;
    this._referResourcePool = null;
    this._graphicResourcePool = null;
    this._contentRestorerPool = null;
    this._loadingPromises = null;
  }

  private _resolveLoadItemOptions(assetInfo: LoadItem, virtualResourceEntry?: VirtualResource): void {
    assetInfo.type = virtualResourceEntry?.type ?? assetInfo.type ?? ResourceManager._getTypeByPath(assetInfo.url);
    if (assetInfo.type === undefined) {
      throw `asset type should be specified: ${assetInfo.url}`;
    }
    assetInfo.params ??= virtualResourceEntry?.params;
    assetInfo.retryCount = assetInfo.retryCount ?? this.retryCount;
    assetInfo.timeout = assetInfo.timeout ?? this.timeout;
    assetInfo.retryInterval = assetInfo.retryInterval ?? this.retryInterval;
  }

  private _loadSingleItem<T>(itemOrURL: LoadItem | string): AssetPromise<T> {
    const item = typeof itemOrURL === "string" ? { url: itemOrURL } : { ...itemOrURL };
    item.url = item.url ?? item.urls.join(",");
    const { assetPath: requestedAssetPath, subAssetPath } = this._parseAssetPath(item.url);
    const subAssetKeys = subAssetPath ? this._parseSubAssetPath(subAssetPath) : [];

    // Registered virtual paths keep their identity. `baseUrl` only applies to ordinary paths.
    const virtualResourceEntry = this._virtualPathResourceMap[requestedAssetPath];
    this._resolveLoadItemOptions(item, virtualResourceEntry);
    item.url =
      !virtualResourceEntry && !Utils.isAbsoluteUrl(requestedAssetPath) && this.baseUrl
        ? Utils.resolveAbsoluteUrl(this.baseUrl, requestedAssetPath)
        : requestedAssetPath;
    const assetPath = item.url;

    // Check cache
    const cacheObject = this._assetByPath[assetPath];
    if (cacheObject) {
      return new AssetPromise((resolve) => {
        resolve(this._getResolveResource(cacheObject, subAssetKeys) as T);
      });
    }

    // Main assets and sub-assets have independent in-flight keys, both rooted at the asset path.
    let loadingKey = assetPath;
    if (subAssetPath) {
      loadingKey += "?q=" + subAssetKeys.shift();
      let index: string;
      while ((index = subAssetKeys.shift())) {
        loadingKey += `[${index}]`;
      }
    }

    // Check is loading
    const loadingPromises = this._loadingPromises;
    const loadingPromise = loadingPromises[loadingKey];
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

    const subpackageName = virtualResourceEntry?.subpackageName;

    // Check sub asset
    if (subAssetPath) {
      // Check whether load main asset
      const mainPromise =
        loadingPromises[assetPath] || this._loadSubpackageAndMainAsset(loader, item, assetPath, subpackageName);

      return this._createSubAssetPromiseCallback<T>(assetPath, loadingKey, subAssetPath, mainPromise);
    }

    return this._loadSubpackageAndMainAsset(loader, item, assetPath, subpackageName);
  }

  // For adapter mini-game platform
  private _loadSubpackageAndMainAsset<T>(
    loader: Loader<T>,
    item: LoadItem,
    assetPath: string,
    subpackageName: string
  ): AssetPromise<T> {
    return this._loadMainAsset(loader, item, assetPath);
  }

  private _loadMainAsset<T>(loader: Loader<T>, item: LoadItem, assetPath: string): AssetPromise<T> {
    const loadingPromises = this._loadingPromises;
    const promise = loader.load(item, this);
    loadingPromises[assetPath] = promise;

    promise.then(
      (resource: T) => {
        if (loader.useCache) {
          this._addAsset(assetPath, resource as EngineObject);
        }
        delete loadingPromises[assetPath];
        this._releaseSubAssetPromiseCallback(assetPath);
      },
      () => {
        delete loadingPromises[assetPath];
        this._releaseSubAssetPromiseCallback(assetPath);
      }
    );

    return promise;
  }

  private _createSubAssetPromiseCallback<T>(
    assetPath: string,
    loadingKey: string,
    assetSubPath: string,
    mainPromise: AssetPromise<unknown>
  ): AssetPromise<T> {
    const loadingPromises = this._loadingPromises;
    const subPromiseCallback = this._subAssetPromiseCallbacks[assetPath]?.[assetSubPath];
    const resolvedValue = subPromiseCallback?.resolvedValue;

    // Already resolved
    if (resolvedValue) {
      return AssetPromise.resolve(resolvedValue);
    }

    // Pending
    const promise = new AssetPromise<T>((resolve, reject, setTaskCompleteProgress, setTaskDetailProgress) => {
      (this._subAssetPromiseCallbacks[assetPath] ||= {})[assetSubPath] = {
        resolve,
        reject
      };

      // A loader may finish the main asset before its eager sub-asset notification reaches this callback.
      // Always resolve from the completed main asset as the authoritative fallback so callback cleanup cannot
      // strand a sub-asset request.
      mainPromise.onProgress(setTaskCompleteProgress, setTaskDetailProgress).then((resource) => {
        try {
          resolve(this._getResolveResource(resource, this._parseSubAssetPath(assetSubPath)) as T);
        } catch (error) {
          reject(error);
        }
      }, reject);
    });

    loadingPromises[loadingKey] = promise;

    promise.then(
      () => {
        delete loadingPromises[loadingKey];
      },
      () => delete loadingPromises[loadingKey]
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
        subResource = subResource?.[path];
        if (subResource === undefined) {
          throw new Error(`Sub-asset path does not exist: ${paths.join(".")}`);
        }
      }
    }
    return subResource;
  }

  private _parseAssetPath(path: string): { assetPath: string; subAssetPath: string } {
    const [basePath, searchStr] = path.split("?");
    let subAssetPath = undefined;
    let assetPath = basePath;
    if (searchStr) {
      const params = searchStr.split("&");
      for (let i = params.length - 1; i >= 0; i--) {
        const param = params[i];
        if (param.startsWith(`q=`)) {
          subAssetPath = decodeURIComponent(param.split("=")[1]);
          params.splice(i, 1);
          break;
        }
      }
      assetPath = params.length > 0 ? basePath + "?" + params.join("&") : basePath;
    }
    return { assetPath, subAssetPath };
  }

  private _parseSubAssetPath(string): string[] {
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

  private _releaseSubAssetPromiseCallback(assetPath: string): void {
    delete this._subAssetPromiseCallbacks[assetPath];
  }

  // Virtual resource mapping

  /** @internal */
  _objectPool: { [key: string]: any } = Object.create(null);
  private _virtualPathResourceMap: Record<VirtualPath, VirtualResource> = Object.create(null);

  /**
   * Register virtual asset paths and their load descriptors.
   * @remarks References inside runtime scenes and Prefabs can keep stable virtual paths while the backing URLs
   * are generated dynamically, such as object URLs created from a resource package.
   */
  registerVirtualResources(resources: readonly VirtualResource[]): void {
    resources.forEach((resource) => {
      this._virtualPathResourceMap[resource.virtualPath] = resource;
    });
  }

  /**
   * @internal
   * @beta Just for internal editor, not recommended for developers.
   */
  getResourceByRef<T extends EngineObject>(ref: { url: string; key?: string; isClone?: boolean }): AssetPromise<T> {
    const { url: assetPath, key, isClone } = ref;
    if (!assetPath) {
      Logger.warn("ResourceManager.getResourceByRef: url is empty.");
      return AssetPromise.resolve(null);
    }

    const cached = this._objectPool[assetPath];
    if (cached) {
      return AssetPromise.resolve(isClone ? <T>(<IClone>(<unknown>cached)).clone() : cached);
    }

    const mapped = this._virtualPathResourceMap[assetPath];
    if (!mapped) {
      Logger.warn(`ResourceManager.getResourceByRef: url "${assetPath}" not found in virtualPathResourceMap.`);
      return AssetPromise.resolve(null);
    }

    const loadPath = key ? assetPath + "?q=" + key : assetPath;
    // type and params omitted: resolved from the virtualPath map, the single source of truth
    const promise = this.load<T>({ url: loadPath });
    return isClone ? promise.then((item) => <T>(<IClone>(<unknown>item)).clone()) : promise;
  }
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

type VirtualPath = string;
export interface VirtualResource {
  /** Stable logical identity used by asset references, loaders, and caches. */
  virtualPath: string;
  /** Physical URL used only when the runtime issues a request. */
  path: string;
  type: string;
  dependentAssetMap?: { [key: string]: string };
  subpackageName?: string;
  params?: Record<string, any>;
}
type SubAssetPromiseCallbacks<T> = Record<
  // Main asset path, such as "Assets/Models/hero.glb".
  string,
  Record<
    // Sub-asset path, such as "textures[0]".
    string,
    {
      // Already resolved
      resolvedValue?: T;
      // Pending
      resolve?: (value: T) => void;
      reject?: (reason: any) => void;
    }
  >
>;
