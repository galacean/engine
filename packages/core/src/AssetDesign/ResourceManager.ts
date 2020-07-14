import { AssetPromise } from "./AssetPromise";
import { LoadItem } from "./LoadItem";
import { ReferenceObject } from "./ReferenceObject";
import { Engine } from "..";
import { Loader } from "./Loader";
import { AssetType } from "./AssetType";

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
  private static _extTypeMapping: { [key: string]: AssetType } = {};

  /** @internal */
  static _addLoader(type: AssetType, loader: Loader<any>, extnames: string[]) {
    this._loaders[type] = loader;
    for (let i = 0, len = extnames.length; i < len; i++) {
      this._extTypeMapping[extnames[i]] = type;
    }
  }

  private static _getTypeByUrl(url: string): AssetType {
    return this._extTypeMapping[url.substring(url.lastIndexOf(".") + 1)];
  }

  /** 资产路径池,key为资产ID，值为资产路径，通过路径加载的资源均放入该池中，用于资源文件管理。*/
  private _assetPool: { [key: number]: string } = Object.create(null);
  /** 资产池,key为资产路径，值为资产，通过路径加载的资源均放入该池中，用于资产文件管理。*/
  private _assetUrlPool: { [key: string]: Object } = Object.create(null);
  /** 引用计数对象池,key为对象ID，引用计数的对象均放入该池中。*/
  private _referenceObjectPool: { [key: number]: ReferenceObject } = Object.create(null);

  /** 加载失败后的重试次数。*/
  retryCount: number = 1;
  /** 加载失败后的重试延迟时间，单位是毫秒。*/
  retryInterval: number = 0;
  /** 资源默认超时时间 */
  timeout: number = 10000;

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
      return this.loadSingleItem(assetInfo);
    }
    // 数组资源加载
    const promises = assetInfo.map((item) => this.loadSingleItem<T>(item));

    return AssetPromise.all<T>(promises);
  }
  /**
   * 取消所有未完成加载的资产。
   */
  cancelNotLoaded(): void;

  /**
   * @internal
   */
  cancelNotLoaded(path?: string | string[]): void {}

  /**
   * 垃圾回收，会释放受引用计数管理的资源对象。
   * @remarks 释放原则为没有被组件实例引用，包含直接引用和间接引用。
   */
  gc(): void {}

  /**
   * @internal
   */
  _addAsset(path: string, asset: ReferenceObject): void {
    this._assetPool[asset.instanceID] = path;
    this._assetUrlPool[path] = asset;
  }

  /**
   * @internal
   */
  _deleteAsset(asset: ReferenceObject): void {
    const id = asset.instanceID;
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
    return assetInfo;
  }

  private loadSingleItem<T>(item: LoadItem | string): AssetPromise<T> | never {
    let info: LoadItem;
    if (typeof item === "string") {
      info = this._assignDefaultOptions({ url: item });
    } else {
      info = this._assignDefaultOptions(item);
    }
    return ResourceManager._loaders[info.type].load(info, this);
  }
}

export function resourceLoader(assetType: AssetType, extnames: string[]) {
  return <T extends Loader<any>>(Target: { new (): T }) => {
    //@ts-ignore
    ResourceManager._addLoader(assetType, new Target(), extnames);
  };
}
