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

  /** @internal */
  @ignoreClone
  protected _registeredScene: Scene | null = null;

  @ignoreClone
  private _phasedActive: boolean = false;

  private _enabled: boolean = true;

  protected get _phasedActiveInScene(): boolean {
    return this._registeredScene !== null;
  }

  /**
   * Indicates whether the component is enabled.
   */
  get enabled(): boolean {
    return this._enabled;
  }

  set enabled(value: boolean) {
    if (value !== this._enabled) {
      this._enabled = value;
      this._syncSceneRegistration();
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
   * Removes this component from its entity and runs its teardown.
   * @remarks During a frame, removal is deferred until the frame ends.
   * @throws If removal would leave a remaining component on a live entity without its required provider.
   */
  override destroy(): void {
    if (this._destroyed) return;
    const engine = this._engine;
    if (!engine._frameInProcess || engine._processingPendingDestroys) {
      const entity = this._entity;
      if (!entity.destroyed && entity._components.includes(this)) {
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
   * Releases registration from the scene that registered this component.
   * @internal
   * @param _scene - Registration owner, which may differ from the entity's current scene
   */
  _onDisableInScene(_scene: Scene): void {}

  /**
   * Releases scene registration without changing hierarchy activation.
   * @internal
   * @returns Whether the component had a scene registration
   */
  _deactivateInScene(): boolean {
    const scene = this._registeredScene;
    if (!scene) return false;
    this._registeredScene = null;
    this._onDisableInScene(scene);
    return true;
  }

  /**
   * @internal
   */
  _setActive(value: boolean, activeChangeFlag: ActiveChangeFlag): void {
    if (this._destroyed) return;
    const entity = this._entity;

    if (activeChangeFlag & ActiveChangeFlag.Scene) {
      this._syncSceneRegistration();
    }

    if (activeChangeFlag & ActiveChangeFlag.Hierarchy) {
      if (value) {
        if (!this._awoken && entity._isActiveInHierarchy) {
          this._awoken = true;
          this._onAwake();
        }
        // onAwake can change the entity's activation or the component's enabled state.
        if (!this._phasedActive && entity._isActiveInHierarchy && this._enabled) {
          this._phasedActive = true;
          this._onEnable();
        }
      } else {
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
    if (this._registeredScene) {
      try {
        this._deactivateInScene();
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

  private _syncSceneRegistration(): void {
    const entity = this._entity;
    const registeredScene = this._registeredScene;
    let scene = entity._isActiveInScene && this._enabled ? entity._scene! : null;
    if (scene === registeredScene) return;

    if (registeredScene) {
      this._deactivateInScene();
      // A teardown hook can change the desired scene or register the component again.
      if (this._registeredScene || this._destroyed) return;
      scene = entity._isActiveInScene && this._enabled ? entity._scene! : null;
    }
    if (scene) {
      this._registeredScene = scene;
      this._onEnableInScene();
    }
  }
}

registerDefaultCloneMode(Component, CloneMode.Remap);
