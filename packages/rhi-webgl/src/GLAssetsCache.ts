import { AssetType } from "@alipay/o3-base";
import { AssetObject } from "@alipay/o3-core";
import { WebGLRenderer } from "./WebGLRenderer";
import { GLAsset } from "./GLAsset";
import { RHIOption } from "@alipay/o3-core/types/type";

interface ObjectSet {
  [key: number]: GLAsset;
}

/**
 * 引擎的资源对象所需要的 GL 资源对象的 Cache 管理
 * @private
 */
export class GLAssetsCache {
  private readonly _rhi: WebGLRenderer;
  private _objectSet: ObjectSet;
  private _checkList: GLAsset[];
  private _nextID: number;
  private readonly _enableCollect: boolean;

  constructor(rhi: WebGLRenderer, props: RHIOption = {}) {
    this._rhi = rhi;
    this._objectSet = {}; // 所有资源对象的集合
    this._checkList = []; // 需要检测生命周期的对象列表
    this._nextID = 1;
    // 是否启用回收机制
    this._enableCollect = props.enableCollect === undefined ? true : !!props.enableCollect;
  }

  /**
   * 为一个引擎资源对象创建对应的 GL 资源对象
   * @param {object} asset
   * @param {class} ctor
   */
  requireObject(asset: AssetObject, ctor: new (...args: any) => GLAsset) {
    let cachedObject = null;

    //-- 查找已有
    if (asset.cacheID) {
      cachedObject = this._objectSet[asset.cacheID];
    }

    if (!cachedObject || asset.needRecreate) {
      const cacheID = this._nextID++;
      const objectSet = this._objectSet;

      //-- 创新新的
      cachedObject = new ctor(this._rhi, asset);
      objectSet[cacheID] = cachedObject;
      cachedObject.cacheID = cacheID;
      cachedObject.asset = asset;
      asset.cacheID = cacheID;
      asset.needRecreate = false;

      //-- 处理运行时资源释放
      if (this._enableCollect && asset.type === AssetType.Cache) {
        this._checkList.push(cachedObject);
      }
    }

    cachedObject.activeFrame = this._rhi.frameCount;
    return cachedObject;
  }

  /**
   * 清除 Cache 中没有用到的 GL 资源对象
   */
  compact() {
    if (!this._enableCollect) return;

    const currentFrame = this._rhi.frameCount;

    const checkList = this._checkList;
    const objectSet = this._objectSet;

    for (let i = checkList.length - 1; i >= 0; i--) {
      const cachedObject = checkList[i];
      if (cachedObject.activeFrame < currentFrame) {
        delete objectSet[cachedObject.cacheID];
        checkList.splice(i, 1);

        cachedObject.finalize();
      }
    }
  }

  /**
   * 释放内部登记的所有对象
   */
  finalize() {
    for (const name in this._objectSet) {
      const obj = this._objectSet[name];
      obj.finalize(true);
    }
    this._objectSet = {};
    this._checkList = [];
  }
}
