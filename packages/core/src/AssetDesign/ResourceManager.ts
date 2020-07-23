import { AssetPromise } from "./AssetPromise";
import { LoadItem } from "./LoadItem";
import { ReferenceObject } from "./ReferenceObject";
import { Engine } from "..";
/**
 * 资源管理员。
 */
export class ResourceManager {
  /** 资产路径池,key为资产ID，值为资产路径，通过路径加载的资源均放入该池中，用于资源文件管理。*/
  private _assetPathPool: { [key: number]: string } = {};
  /** 资产池,key为资产路径，值为资产，通过路径加载的资源均放入该池中，用于资产文件管理。*/
  private _assetPool: { [key: string]: Object } = {};
  /** 引用计数对象池,key为对象ID，引用计数的对象均放入该池中。*/
  private _referenceObjectPool: { [key: number]: ReferenceObject } = {};

  /** 加载失败后的重试次数。*/
  retryCount: number = 1;
  /** 加载失败后的重试延迟时间，单位是毫秒。*/
  retryDelay: number = 0;

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
  load<T>(assetInfo: string | string[] | LoadItem | LoadItem[]): AssetPromise<T> {
    return null;
  }

  /**
   * 取消所有未完成加载的资产。
   */
  cancelNotLoaded(): void {}

  /**
   * 垃圾回收，会释放受引用计数管理的资源对象。
   * @remarks 释放原则为没有被组件实例引用，包含直接引用和间接引用。
   */
  gc(): void {}

  /**
   * @internal
   */
  _addAsset(path: string, asset: ReferenceObject): void {
    this._assetPathPool[asset.instanceID] = path;
    this._assetPool[path] = asset;
  }

  /**
   * @internal
   */
  _deleteAsset(asset: ReferenceObject): void {
    const id = asset.instanceID;
    const path = this._assetPathPool[id];
    if (path) {
      delete this._assetPathPool[id];
      delete this._assetPool[path];
    }
  }

  /**
   * @internal
   */
  _getAssetPath(id: number): string {
    return this._assetPathPool[id];
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
}
