import { IReferable } from "./asset/IReferable";
import { EngineObject } from "./base";
import { CloneMode, ignoreClone, registerDefaultCloneMode } from "./clone/CloneDecorators";
import { ComponentsDependencies } from "./ComponentsDependencies";
import { ComponentConstructor, Entity } from "./Entity";
import { ActiveChangeFlag } from "./enums/ActiveChangeFlag";
import { Scene } from "./Scene";

/**
 * The base class of the components.
 */
export class Component extends EngineObject {
  /** @internal */
  _entity: Entity;

  /** @internal */
  @ignoreClone
  _awoken: boolean = false;

  @ignoreClone
  protected _phasedActiveInScene: boolean = false;

  @ignoreClone
  private _phasedActive: boolean = false;

  private _enabled: boolean = true;

  /**
   * Indicates whether the component is enabled.
   */
  get enabled(): boolean {
    return this._enabled;
  }

  set enabled(value: boolean) {
    if (value !== this._enabled) {
      this._enabled = value;
      if (this._entity._isActiveInScene) {
        if (value) {
          if (!this._phasedActiveInScene) {
            this._phasedActiveInScene = true;
            this._onEnableInScene();
          }
        } else {
          if (this._phasedActiveInScene) {
            this._phasedActiveInScene = false;
            this._onDisableInScene();
          }
        }
      }
      if (this._entity.isActiveInHierarchy) {
        if (value) {
          if (!this._phasedActive) {
            this._phasedActive = true;
            this._onEnable();
          }
        } else {
          if (this._phasedActive) {
            this._phasedActive = false;
            this._onDisable();
          }
        }
      }
    }
  }

  /**
   * The entity which the component belongs to.
   */
  get entity(): Entity {
    return this._entity;
  }

  /**
   * The owning entity's scene, or null/undefined if it is not in a scene.
   */
  get scene(): Scene | null | undefined {
    return this._entity.scene;
  }

  constructor(entity: Entity) {
    super(entity.engine);
    this._entity = entity;
  }

  /**
   * Destroy self.
   */
  override destroy(): void {
    if (this._destroyed) return;
    const engine = this._engine;
    if (!engine?._frameInProcess || engine._processingPendingDestroys) {
      const entity = this._entity;
      if (entity._components?.includes(this)) {
        this._pendingDestroy = false;
        ComponentsDependencies._removeCheck(entity, this.constructor as ComponentConstructor);
      }
    }
    super.destroy();
  }

  /**
   * @internal
   */
  _onAwake(): void {}

  /**
   * @internal
   */
  _onEnable(): void {}

  /**
   * @internal
   */
  _onDisable(): void {}

  /**
   * @internal
   */
  _onEnableInScene(): void {}

  /**
   * @internal
   */
  _onDisableInScene(): void {}

  /**
   * @internal
   */
  _onSceneChanged(_scene: Scene): void {}

  /**
   * @internal
   * Deactivate in scene while the owning Entity remains active (used during atomic component replacement).
   */
  _deactivateInScene(): boolean {
    if (this._phasedActiveInScene) {
      this._phasedActiveInScene = false;
      this._onDisableInScene();
      return true;
    }
    return false;
  }

  /**
   * @internal
   */
  _setActive(value: boolean, activeChangeFlag: ActiveChangeFlag): void {
    const entity = this._entity;

    // Process active in scene, precautions are the same as below
    if (activeChangeFlag & ActiveChangeFlag.Scene) {
      if (value) {
        if (!this._phasedActiveInScene && entity._isActiveInScene && this._enabled) {
          this._phasedActiveInScene = true;
          this._onEnableInScene();
        }
      } else {
        if (this._phasedActiveInScene && !(entity._isActiveInScene && this._enabled)) {
          this._phasedActiveInScene = false;
          this._onDisableInScene();
        }
      }
    }

    // Process active in hierarchy
    if (activeChangeFlag & ActiveChangeFlag.Hierarchy) {
      if (value) {
        // Awake condition is un awake && current entity is active in hierarchy
        if (!this._awoken && entity._isActiveInHierarchy) {
          this._awoken = true;
          this._onAwake();
        }
        // Developer maybe do `isActive = false` in `onAwake` method
        // Enable condition is phased active state is false && current component is active in hierarchy
        if (!this._phasedActive && entity._isActiveInHierarchy && this._enabled) {
          this._phasedActive = true;
          this._onEnable();
        }
      } else {
        // Disable condition is phased active state is true && current component is inActive in hierarchy
        if (this._phasedActive && !(entity._isActiveInHierarchy && this._enabled)) {
          this._phasedActive = false;
          this._onDisable();
        }
      }
    }
  }

  protected _addResourceReferCount(resource: IReferable, count: number): void {
    this._entity._isTemplate || resource._addReferCount(count);
  }

  /**
   * @internal
   */
  protected override _onDestroy(): void {
    const entity = this._entity;
    entity._removeComponent(this);
    super._onDestroy();
    let firstError: unknown;
    let hasError = false;
    if (this._phasedActiveInScene) {
      this._phasedActiveInScene = false;
      try {
        this._onDisableInScene();
      } catch (error) {
        firstError = error;
        hasError = true;
      }
    }
    if (this._phasedActive) {
      this._phasedActive = false;
      try {
        this._onDisable();
      } catch (error) {
        if (!hasError) {
          firstError = error;
          hasError = true;
        }
      }
    }
    if (hasError) {
      throw firstError;
    }
  }
}

registerDefaultCloneMode(Component, CloneMode.Remap);
