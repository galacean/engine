import { Engine } from "../Engine";
import { AssetObject } from "./AssetObject";

/**
 * 资产的基类，具有引用计数能力。
 */
export abstract class ReferenceObject extends AssetObject {
  /** 是否忽略垃圾回收的检查,如果为 true ,将不受 ResourceManager.gc() 影响。*/
  isGCIgnored: boolean = false;

  protected _engine: Engine;
  protected _gcPriority: number = 0;

  private _referenceCount: number = 0;
  private _destroyed: boolean = false;

  /** @internal */
  get gcPriority(): number {
    return this._gcPriority;
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
    super();
    const resEngine = engine || Engine.defaultCreateObjectEngine || Engine._lastCreateEngine;
    if (!resEngine) throw "asset must belone to an engine.";
    this._engine = resEngine;
    resEngine.resourceManager._addReferenceObject(this.instanceId, this);
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
    this._destroyed = true;
    this._engine = null;
    return true;
  }

  /**
   * 当资源真正销毁时调。交由子类重写
   */
  protected abstract onDestroy(): void;

  /**
   * @internal
   */
  _addToAssetManager(path: string): void {
    this._engine.resourceManager._addAsset(path, this);
  }

  /**
   * @private
   */
  _addReference(referenceCount: number): void {
    this._referenceCount += referenceCount;
  }
}
