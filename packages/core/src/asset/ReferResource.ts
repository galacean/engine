import { EngineObject } from "../base/EngineObject";
import { Engine } from "../Engine";
import { IReferable } from "./IReferable";

/**
 * The base class of assets, with reference counting capability.
 */
export abstract class ReferResource extends EngineObject implements IReferable {
  /** Whether to ignore the garbage collection check, if it is true, it will not be affected by ResourceManager.gc(). */
  isGCIgnored: boolean = false;

  private _refCount: number = 0;
  private _superResources: ReferResource[] = null;

  /**
   * Counted by valid references.
   */
  get refCount(): number {
    return this._refCount;
  }

  protected constructor(engine: Engine) {
    super(engine);
    engine.resourceManager._addReferResource(this);
  }

  /**
   * Destroy self.
   * @param force - Whether to force the destruction, if it is false, refCount = 0 can be released successfully
   * @returns Whether the release was successful
   */
  override destroy(force?: boolean): boolean;

  /**
   * @internal
   */
  override destroy(force: boolean, isGC: boolean): boolean;

  override destroy(force: boolean = false, isGC?: boolean): boolean {
    if (!force && this._refCount !== 0) {
      const superResources = this._superResources;
      if (superResources) {
        if (isGC) {
          for (let i = 0, n = superResources.length; i < n; i++) {
            if (superResources[i].refCount > 0) {
              return false;
            }
          }
        }
      } else {
        if (this._superResources.length > 0) {
          return false;
        }
      }
    }
    super.destroy();
    return true;
  }

  /**
   * @internal
   */
  _associationSuperResource(superResource: ReferResource): void {
    (this._superResources ||= []).push(superResource);
  }

  /**
   * @internal
   */
  _disassociationSuperResource(superResource: ReferResource): void {
    const superResources = this._superResources;
    const index = superResources.indexOf(superResource);
    superResources.splice(index, 1);
  }

  /**
   * @internal
   */
  _getReferCount(): number {
    return this._refCount;
  }

  /**
   * @internal
   */
  _addReferCount(value: number): void {
    this._refCount += value;
  }

  /**
   * @internal
   */
  _addToResourceManager(path: string): void {
    this._engine.resourceManager._addAsset(path, this);
  }

  /**
   * @internal
   */
  protected override _onDestroy(): void {
    super._onDestroy();
    this._engine.resourceManager._deleteReferResource(this);
    const refCount = this._getReferCount();
    if (refCount > 0) {
      this._addReferCount(-refCount);
    }
  }
}
