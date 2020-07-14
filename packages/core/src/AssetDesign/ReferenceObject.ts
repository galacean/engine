import { Engine } from "../Engine";
import { ResourceManager } from "./ResourceManager";

/**
 * 资产的基类，具有引用计数能力。
 */
export abstract class ReferenceObject {
  /** 是否忽略垃圾回收的检查,如果为 true ,将不受 ResourceManager.garbageCollection() 影响。*/
  ignoreGG: boolean = false;

  protected _engine: Engine;

  private _instanceID: number;
  private _referenceCount: number = 0;
  private _destroyed: boolean = false;

  /**
   * 实例ID。
   */
  get instanceID(): number {
    return this._instanceID;
  }

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

  protected constructor(engine?: Engine) {
    const resEngine = engine || ResourceManager.defaultCreateAssetEngine || Engine._lastCreateEngine;
    if (!resEngine) throw "asset must belone to an engine.";
    this._engine = resEngine;
    this._instanceID = ++Engine._instanceIDCounter;
    resEngine.resourceManager._addReferenceObject(this.instanceID, this);
  }

  /**
   * 销毁。
   * @param force - 是否强制销毁,如果为 fasle 则 referenceCount = 0 可释放成功
   * @returns 是否释放成功
   */
  destroy(force: boolean = false): boolean {
    if (this._destroyed) return true;
    if (!force && this._referenceCount !== 0) return false;

    this._engine.resourceManager._deleteAsset(this);
    this._engine.resourceManager._deleteReferenceObject(this.instanceID);
    this._destroyed = true;
    return true;
  }

  /**
   * @internal
   */
  _addToAssetManager(path: string): void {
    this._engine.resourceManager._addAsset(path, this);
  }

  /**
   * @internal
   */
  _addReference(referenceCount: number): void {
    this._referenceCount += referenceCount;
  }
}
