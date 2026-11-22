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
  private _superResources: ReferResource[] | null = null;
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

      const superResources = this._superResources!;
      if (superResources?.length) {
        if (isGC) {
          if (this._isRetainedBySuperResource()) {
            return false;
          }
        } else {
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
    if (superResource._destroyed) {
      return;
    }
    const subResources = (superResource._subResources ||= new Set());
    if (!subResources.has(this)) {
      subResources.add(this);
      (this._superResources ||= []).push(superResource);
    }
  }

  /**
   * @internal
   */
  _disassociationSuperResource(superResource: ReferResource): void {
    superResource._subResources?.delete(this);
    const superResources = this._superResources;
    if (!superResources) {
      return;
    }
    const index = superResources.indexOf(superResource);
    if (index !== -1) {
      superResources.splice(index, 1);
    }
  }

  /**
   * @internal
   */
  _disassociationAllSubResources(): void {
    const subResources = this._subResources;
    if (subResources) {
      this._subResources = null;
      subResources.forEach((subResource) => {
        subResource._disassociationSuperResource(this);
      });
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
    const superResources = this._superResources;
    if (superResources) {
      for (let i = superResources.length - 1; i >= 0; i--) {
        superResources[i]._subResources?.delete(this);
      }
      superResources.length = 0;
    }
  }

  private _isRetainedBySuperResource(): boolean {
    const superResources = this._superResources;
    if (superResources) {
      for (let i = 0, n = superResources.length; i < n; i++) {
        const superResource = superResources[i];
        if (
          !superResource.destroyed &&
          (superResource.refCount > 0 || superResource.isGCIgnored || superResource._isRetainedBySuperResource())
        ) {
          return true;
        }
      }
    }
    return false;
  }
}

registerDefaultCloneMode(ReferResource, CloneMode.Assignment);
