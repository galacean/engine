import { EngineObject } from "./base";
import { assignmentClone, ignoreClone } from "./clone/CloneManager";
import { Entity } from "./Entity";
import { ActiveChangeFlag } from "./enums/ActiveChangeFlag";
import { Scene } from "./Scene";

/**
 * The base class of the components.
 */
export class Component extends EngineObject {
  /** @internal */
  @ignoreClone
  _entity: Entity;
  /** @internal */
  @ignoreClone
  _awoken: boolean = false;

  @ignoreClone
  protected _phasedActiveInScene: boolean = false;

  @ignoreClone
  private _phasedActive: boolean = false;
  @assignmentClone
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
   * The scene which the component's entity belongs to.
   */
  get scene(): Scene {
    return this._entity.scene;
  }

  constructor(entity: Entity) {
    super(entity.engine);
    this._entity = entity;
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

  /**
   * @internal
   */
  protected override _onDestroy(): void {
    super._onDestroy();
    const entity = this._entity;
    entity._removeComponent(this);
    if (this._enabled) {
      entity._isActiveInScene && this._onDisableInScene();
      entity._isActiveInHierarchy && this._onDisable();
    }
  }
}
