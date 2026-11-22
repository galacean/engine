import { EngineObject } from "../base/EngineObject";
import { CloneMode, registerDefaultCloneMode } from "../clone/CloneDecorators";
import { Engine } from "../Engine";
import { IReferable } from "./IReferable";

/**
 * The base class of assets, with reference counting capability.
 */
export abstract class ReferResource extends EngineObject implements IReferable {
  /** Whether to ignore the garbage collection check, if it is true, it will not be affected by ResourceManager.gc(). */
  isGCIgnored: boolean = false;

  private _refCount: number = 0;
  private _superResources: Set<ReferResource> | null = null;
  private _subResources: Set<ReferResource> | null = null;

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
    if (!this._pendingDestroy && !force) {
      if (this._refCount !== 0) {
        return false;
      }

      if (this._superResources?.size && (!isGC || this._isRetainedBySuperResource())) {
        return false;
      }
    }

    super.destroy();
    return true;
  }

  /**
   * @internal
   */
  _associationSuperResource(superResource: ReferResource): void {
    if (this._destroyed || superResource._destroyed) return;
    (this._superResources ||= new Set()).add(superResource);
    (superResource._subResources ||= new Set()).add(this);
  }

  /**
   * @internal
   */
  _disassociationSuperResource(superResource: ReferResource): void {
    this._superResources?.delete(superResource);
    superResource._subResources?.delete(this);
  }

  /**
   * @internal
   */
  _disassociationAllSubResources(): void {
    const subResources = this._subResources;
    if (subResources) {
      this._subResources = null;
      subResources.forEach((sub) => sub._superResources?.delete(this));
    }
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
    this._disassociationAllSubResources();
    this._superResources?.forEach((superResource) => superResource._subResources?.delete(this));
    this._superResources = null;
  }

  private _isRetainedBySuperResource(): boolean {
    if (this._superResources) {
      for (const superResource of this._superResources) {
        if (superResource._refCount > 0 || superResource.isGCIgnored || superResource._isRetainedBySuperResource()) {
          return true;
        }
      }
    }
    return false;
  }
}

registerDefaultCloneMode(ReferResource, CloneMode.Assignment);
