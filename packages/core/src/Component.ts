import { EngineObject } from "./base";
import { assignmentClone, ignoreClone } from "./clone/CloneManager";
import { Engine } from "./Engine";
import { Entity } from "./Entity";
import { Scene } from "./Scene";

/**
 * The base class of the components.
 */
export abstract class Component extends EngineObject {
  /** @internal */
  @ignoreClone
  _entity: Entity;
  /** @internal */
  @ignoreClone
  _destroyed: boolean = false;

  @assignmentClone
  private _enabled: boolean = true;
  @ignoreClone
  private _awaked: boolean = false;

  /**
   * Indicates whether the component is enabled.
   */
  get enabled(): boolean {
    return this._enabled;
  }

  set enabled(value: boolean) {
    if (value === this._enabled) {
      return;
    }
    this._enabled = value;
    if (value) {
      this._entity.isActiveInHierarchy && this._onEnable();
    } else {
      this._entity.isActiveInHierarchy && this._onDisable();
    }
  }

  /**
   * Indicates whether the component is destroyed.
   */
  get destroyed(): boolean {
    return this._destroyed;
  }

  /**
   * The entitiy which the component belongs to.
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

  /**
   * The engine which the component's entity belongs to.
   */
  get engine(): Engine {
    return this._entity.engine;
  }

  constructor(entity: Entity) {
    super(entity.engine);
    this._entity = entity;
  }

  /**
   * Destory this instance.
   */
  destroy(): void {
    if (this._destroyed) {
      return;
    }
    this._entity._removeComponent(this);
    if (this._entity.isActiveInHierarchy) {
      this._enabled && this._onDisable();
      this._onInActive();
    }
    this._destroyed = true;
    this._onDestroy();
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
  _onDestroy(): void {}

  /**
   * @internal
   */
  _onActive(): void {}

  /**
   * @internal
   */
  _onInActive(): void {}

  /**
   * @internal
   */
  _setActive(value: boolean): void {
    if (value) {
      if (!this._awaked) {
        this._awaked = true;
        this._onAwake();
      }
      // You can do isActive = false in onAwake function.
      if (this._entity._isActiveInHierarchy) {
        this._onActive();
        this._enabled && this._onEnable();
      }
    } else {
      this._enabled && this._onDisable();
      this._onInActive();
    }
  }
}
