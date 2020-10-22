import { EngineObject } from "..";
import { Engine } from "../Engine";

/**
 * 资产的基类，具有引用计数能力。
 */
export abstract class RefObject extends EngineObject {
  /** 是否忽略垃圾回收的检查,如果为 true ,将不受 ResourceManager.gc() 影响。*/
  isGCIgnored: boolean = false;
  private _refCount: number = 0;
  private _destroyed: boolean = false;

  private _refChildren: RefObject[] = [];
  private _parent: RefObject = null;

  /**
   * 被有效引用计数。
   */
  get refCount(): number {
    return this._refCount;
  }

  /**
   * 是否已销毁。
   */
  get destroyed(): boolean {
    return this._destroyed;
  }

  protected constructor(engine: Engine) {
    super(engine);
    engine = engine ?? Engine._lastCreateEngine;
    this._engine = engine;
    engine.resourceManager._addRefObject(this.instanceId, this);
  }

  /**
   * 销毁。
   * @param force - 是否强制销毁,如果为 fasle 则 refCount = 0 可释放成功
   * @returns 是否释放成功
   */
  destroy(force: boolean = false): boolean {
    if (this._destroyed) return true;
    if (!force && this._refCount !== 0) return false;

    this.onDestroy();

    this._engine.resourceManager._deleteAsset(this);
    this._engine.resourceManager._deleteRefObject(this.instanceId);
    if (this._parent) {
      removeFromArray(this._parent._refChildren, this);
    }
    this._engine = null;
    this._destroyed = true;
    return true;
  }

  /**
   * 当资源真正销毁时调。交由子类重写
   */
  protected abstract onDestroy(): void;

  /**
   * 把当前资源添加到资源管理中。
   * @internal
   * @param path
   */
  _addToResourceManager(path: string): void {
    this._engine.resourceManager._addAsset(path, this);
  }

  /**
   * @internal
   * 添加资源引用数
   */
  _addRefCount(refCount: number): void {
    this._refCount += refCount;
    const refChildren = this._refChildren;
    for (const item of refChildren) {
      item._addRefCount(refCount);
    }
  }

  /**
   * @internal
   * 添加引用资源。
   */
  _addRefChild(obj: RefObject): void {
    this._refChildren.push(obj);
    obj._parent = this;
    obj._addRefCount(this._refCount);
  }

  /**
   * @internal
   * 移出引用资源。
   */
  _removeRefChild(obj: RefObject): void {
    const refChildren = this._refChildren;
    if (removeFromArray(refChildren, obj)) {
      obj._parent = null;
      obj._addRefCount(-this._refCount);
    }
  }
}

/**
 * @todo as a utilize function
 * @param arr
 */
function removeFromArray(arr: any[], item: any): boolean {
  const index = arr.indexOf(item);
  if (index < 0) {
    return false;
  }
  const last = arr.length - 1;
  if (index !== last) {
    const end = arr[last];
    arr[index] = end;
  }
  arr.length--;
  return true;
}
