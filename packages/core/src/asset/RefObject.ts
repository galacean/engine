import { EngineObject } from "../base/EngineObject";
import { Engine } from "../Engine";
import { IRefObject } from "./IRefObject";

/**
 * The base class of assets, with reference counting capability.
 */
export abstract class RefObject extends EngineObject implements IRefObject {
  /** Whether to ignore the garbage collection check, if it is true, it will not be affected by ResourceManager.gc(). */
  isGCIgnored: boolean = false;

  private _refCount: number = 0;
  private _destroyed: boolean = false;

  /**
   * Counted by valid references.
   */
  get refCount(): number {
    return this._refCount;
  }

  /**
   * Whether it has been destroyed.
   */
  get destroyed(): boolean {
    return this._destroyed;
  }

  protected constructor(engine: Engine) {
    super(engine);
    engine.resourceManager._addRefObject(this.instanceId, this);
  }

  /**
   * Destroy self.
   * @param force - Whether to force the destruction, if it is false, refCount = 0 can be released successfully.
   * @returns Whether the release was successful.
   */
  destroy(force: boolean = false): boolean {
    if (this._destroyed) return true;
    if (!force && this._refCount !== 0) return false;
    const resourceManager = this._engine.resourceManager;
    // resourceManager maybe null,because engine has destroyed.
    // TODO:the right way to fix this is to ensure destroy all when call engine.destroy,thus don't need to add this project.
    if (resourceManager) {
      resourceManager._deleteAsset(this);
      resourceManager._deleteRefObject(this.instanceId);
    }

    const refCount = this._getRefCount();
    if (refCount > 0) {
      this._addRefCount(-refCount);
    }
    this._engine = null;
    this._onDestroy();
    this._destroyed = true;
    return true;
  }

  /**
   * @internal
   */
  _getRefCount(): number {
    return this._refCount;
  }

  /**
   * @internal
   * Add reference resource.
   */
  _addRefCount(value: number): void {
    this._refCount += value;
  }

  /**
   * @internal
   * Remove reference resource.
   */
  _addToResourceManager(path: string): void {
    this._engine.resourceManager._addAsset(path, this);
  }

  /**
   * Called when the resource is destroyed.
   * Subclasses can override this function.
   */
  protected abstract _onDestroy(): void;
}
