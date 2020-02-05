import { AssetObject } from "./AssetObject";

/**
 * 资源池：管理所有资源对象
 */
export class AssetPool {
  private _assets: { [key: string]: AssetObject };

  /**
   * 构造函数
   * @constructor
   */
  constructor() {
    this._assets = {};
  }

  /**
   * 资源池中资源的个数
   */
  get assetsCount(): number {
    return Object.keys(this._assets).length;
  }

  /**
   * 请求一个资源对象：先从内部缓存中查找，如果没有则新建一个
   * @param {string} name
   * @param {AssetObject} ctor
   */
  public requireAsset(name: string, ctor?: { new (name: string, props: object) }, props?: object) {
    let asset = this._assets[name];
    if (!asset) {
      asset = new ctor(name, props);
      this.addAsset(name, asset);
    }
    return asset;
  }

  /**
   * 根据名称查找资源对象
   * @param {string} name
   */
  public findAsset(name: string): AssetObject {
    return this._assets[name];
  }

  /**
   * 向资源池中添加一个对象
   * @param {string} name 资源对象的名称
   * @param {*} assetObject 资源对象
   */
  public addAsset(name: string, assetObject: AssetObject): void {
    this._assets[name] = assetObject;
  }

  /**
   * 移除资源池中的对象
   * @param {string} name
   */
  public removeAsset(name: string): void {
    delete this._assets[name];
  }

  /**
   * 释放资源池里面的所有资源对象
   */
  public clear(): void {
    this._assets = {};
  }
}
