import { AssetPromise } from "./AssetPromise";
import { LoadItem } from "./LoadItem";
import { ReferenceObject } from "./ReferenceObject";
import { Engine } from "..";
import { Loader } from "./Loader";
import { LoaderType } from "./LoaderType";

/**
 * 资源管理员。
 */
export class ResourceManager {
  /**
   * 当前创建资产所属的默认引擎对象。
   * @remarks 最后创建的引擎实例会自动赋值该属性。
   */
  static defaultCreateAssetEngine: Engine = null;

  private static _loaders: { [key: number]: Loader<any> } = {};
  private static _extTypeMapping: { [key: string]: LoaderType } = {};

  /** @internal */
  static _addLoader(type: LoaderType, loader: Loader<any>, extnames: string[]) {
    this._loaders[type] = loader;
    for (let i = 0, len = extnames.length; i < len; i++) {
      this._extTypeMapping[extnames[i]] = type;
    }
  }

  private static _getTypeByUrl(url: string): LoaderType {
    return this._extTypeMapping[url.substring(url.lastIndexOf(".") + 1)];
  }

  /** 资产路径池,key为资产ID，值为资产路径，通过路径加载的资源均放入该池中，用于资源文件管理。*/
  private _assetPool: { [key: number]: string } = Object.create(null);
  /** 资产池,key为资产路径，值为资产，通过路径加载的资源均放入该池中，用于资产文件管理。*/
  private _assetUrlPool: { [key: string]: Object } = Object.create(null);
  /** 引用计数对象池,key为对象ID，引用计数的对象均放入该池中。*/
  private _referenceObjectPool: { [key: number]: ReferenceObject } = Object.create(null);
  /** 加载中的资源 */
  private _loadingPromises: { [url: string]: AssetPromise<any> } = {};

  /** 加载失败后的重试次数。*/
  retryCount: number = 1;
  /** 加载失败后的重试延迟时间，单位是毫秒。*/
  retryInterval: number = 0;
  /** 资源默认超时时间，单位是毫秒(ms) */
  timeout: number = 10000;

  /**
   * 创建资源管理员。
   * @param engine 当前资源管理所属的 engine
   */
  constructor(public readonly engine: Engine) {}

  /**
   * 通过路径异步加载资源。
   * @param path - 路径
   * @returns 资源请求
   */
  load<T>(path: string): AssetPromise<T>;

  /**
   * 通过路径集合异步加载资源集合。
   * @param path - 路径集合
   * @returns 资源请求
   */
  load(pathes: string[]): AssetPromise<Object>;

  /**
   * 通过加载信息集合异步加载资源集合。
   * @param assetItem - 资源加载项
   * @returns 资源请求
   */
  load<T>(assetItem: LoadItem): AssetPromise<T>;

  /**
   * 通过加载信息集合异步加载资源集合。
   * @param assetItems - 资源加载项集合
   * @returns 资源请求
   */
  load(assetItems: LoadItem[]): AssetPromise<Object>;

  /**
   * @internal
   */
  load<T>(assetInfo: string | LoadItem | (LoadItem | string)[]): AssetPromise<T | T[]> | never {
    // 单个资源加载
    if (!Array.isArray(assetInfo)) {
      return this._loadSingleItem(assetInfo);
    }
    // 数组资源加载
    const promises = assetInfo.map((item) => this._loadSingleItem<T>(item));

    return AssetPromise.all(promises);
  }
  /**
   * 取消所有未完成加载的资产。
   */
  cancelNotLoaded(): void;

  /**
   * 取消 url 未完成加载的资产。
   * @param url 资源链接
   */
  cancelNotLoaded(url: string): void;

  /**
   * 取消加载 urls 中未完成加载的资产。
   * @param urls 资源链接数组
   */
  cancelNotLoaded(urls: string[]): void;
  /**
   * @internal
   */
  cancelNotLoaded(url?: string | string[]): void {
    if (!url) {
      Object.values(this._loadingPromises).forEach((promise) => {
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
   * 垃圾回收，会释放受引用计数管理的资源对象。
   * @remarks 释放原则为没有被组件实例引用，包含直接引用和间接引用。
   */
  gc(): void {
    const objects = Object.values(this._referenceObjectPool);
    objects.sort((refObj1, refObj2) => refObj1.gcPriority - refObj2.gcPriority);
    for (let i = 0, len = objects.length; i < len; i++) {
      if (!objects[i].isGCIgnored) {
        objects[i].destroy();
      }
    }
  }

  /**
   * @internal
   */
  _addAsset(path: string, asset: ReferenceObject): void {
    this._assetPool[asset.instanceId] = path;
    this._assetUrlPool[path] = asset;
  }

  /**
   * @internal
   */
  _deleteAsset(asset: ReferenceObject): void {
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
  _getAssetPath(id: number): string {
    return this._assetPool[id];
  }

  /**
   * @internal
   */
  _addReferenceObject(id: number, asset: ReferenceObject): void {
    this._referenceObjectPool[id] = asset;
  }

  /**
   * @internal
   */
  _deleteReferenceObject(id: number): void {
    delete this._referenceObjectPool[id];
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
    // 已经有加载缓存
    if (this._assetUrlPool[url]) {
      return new AssetPromise((resolve) => {
        resolve(this._assetUrlPool[url] as T);
      });
    }

    // 正在加载中
    if (this._loadingPromises[url]) {
      return this._loadingPromises[info.url];
    }
    const loader = ResourceManager._loaders[info.type];
    const promise = loader.load(info, this);
    this._loadingPromises[url] = promise;
    promise.then((res) => {
      if (loader.useCache) this._addAsset(url, res);
      delete this._loadingPromises[url];
    });
    return promise;
  }
}

/**
 * 声明 resourceLoader 的装饰器。
 * @param assetType 资源类型
 * @param extnames 扩展名
 */
export function resourceLoader(assetType: LoaderType, extnames: string[], useCache: boolean = true) {
  return <T extends Loader<any>>(Target: { new (useCache: boolean): T }) => {
    const loader = new Target(useCache);
    ResourceManager._addLoader(assetType, loader, extnames);
  };
}
