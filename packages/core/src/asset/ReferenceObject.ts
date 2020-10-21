import { EngineObject } from "..";
import { Engine } from "../Engine";

/**
 * 资产的基类，具有引用计数能力。
 */
export abstract class ReferenceObject extends EngineObject {
  /** 是否忽略垃圾回收的检查,如果为 true ,将不受 ResourceManager.gc() 影响。*/
  isGCIgnored: boolean = false;
  private _referenceCount: number = 0;
  private _destroyed: boolean = false;

  private _referenceChildren: ReferenceObject[] = [];
  private _parent: ReferenceObject = null;

  /**
   * 被有效引用计数。
   */
  get referenceCount(): number {
    return this._referenceCount;
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
    engine.resourceManager._addReferenceObject(this.instanceId, this);
  }

  /**
   * 销毁。
   * @param force - 是否强制销毁,如果为 fasle 则 referenceCount = 0 可释放成功
   * @returns 是否释放成功
   */
  destroy(force: boolean = false): boolean {
    if (this._destroyed) return true;
    if (!force && this._referenceCount !== 0) return false;

    this.onDestroy();

    this._engine.resourceManager._deleteAsset(this);
    this._engine.resourceManager._deleteReferenceObject(this.instanceId);
    if (this._parent) {
      removeFromArray(this._parent._referenceChildren, this);
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
   * 添加资源引用数
   * @internal
   */
  _addRefCount(referenceCount: number): void {
    this._referenceCount += referenceCount;
    this._addChildrenRefCount(referenceCount);
  }

  /**
   * 添加引用资源的引用数
   * @param referenceCount 引用数
   */
  private _addChildrenRefCount(referenceCount: number) {
    const referenceChildren = this._referenceChildren;
    for (const item of referenceChildren) {
      item._addRefCount(referenceCount);
    }
  }

  /**
   * 添加引用资源。
   * @internal
   */
  _addReferenceChild(obj: ReferenceObject): void {
    if (this._referenceChildren.indexOf(obj) === -1) {
      this._referenceChildren.push(obj);
      obj._parent = this;
      obj._addRefCount(this._referenceCount);
    }
  }

  /**
   * 移出引用资源。
   * @internal
   */
  _removeReferenceChild(obj: ReferenceObject): void {
    const referenceChildren = this._referenceChildren;
    if (removeFromArray(referenceChildren, obj)) {
      obj._parent = null;
      obj._addRefCount(-this._referenceCount);
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
