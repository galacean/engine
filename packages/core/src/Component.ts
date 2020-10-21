import { EventDispatcher, MaskList } from "./base";
import { ignoreClone } from "./clone/CloneManager";
import { Engine } from "./Engine";
import { Entity } from "./Entity";
import { Scene } from "./Scene";

/**
 * 组件的基类。
 */
export abstract class Component extends EventDispatcher {
  /** @internal */
  @ignoreClone
  _entity: Entity;
  /** @internal */
  @ignoreClone
  _destroyed: boolean = false;

  @ignoreClone
  private _enabled: boolean = true;
  @ignoreClone
  private _awaked: boolean = false;

  /**
   * 是否启用。
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
   * 是否已经销毁。
   */
  get destroyed(): boolean {
    return this._destroyed;
  }

  /**
   * 所属节点对象。
   */
  get entity(): Entity {
    return this._entity;
  }

  /**
   * 所属场景对象。
   */
  get scene(): Scene {
    return this._entity.scene;
  }

  /**
   * 所属的Engine对象。
   */
  get engine(): Engine {
    return this._entity.engine;
  }

  constructor(entity: Entity) {
    super();
    this._entity = entity;

    this._renderPassFlag = MaskList.EVERYTHING; // @deprecated
    this._passMasks = [MaskList.EVERYTHING]; // @deprecated
  }

  /**
   * 销毁本组件对象
   */
  destroy(): void {
    if (this._destroyed) return;
    this._entity._removeComponent(this);
    if (this._entity.isActiveInHierarchy) {
      this._enabled && this._onDisable();
      this._onInActive();
    }
    this._destroyed = true;
    this._onDestroy();
  }

  _onAwake(): void {}

  _onEnable(): void {}

  _onDisable(): void {}

  _onDestroy(): void {}

  _onActive(): void {}

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
      this._onActive();
      this._enabled && this._onEnable();
    } else {
      this._enabled && this._onDisable();
      this._onInActive();
    }
  }

  //---------------------------------------------Deprecated-----------------------------------------------------------------

  private _renderPriority: number = 0;
  private _renderPassFlag: MaskList;
  private _passMasks: MaskList[];
  private _cullDistanceSq: number = 0; // 等于0，代表不进行 distance cull

  /**
   * @deprecated
   * 渲染优先级
   * @member {number}
   */
  get renderPriority(): number {
    return this._renderPriority;
  }
  set renderPriority(val: number) {
    this._renderPriority = val;
  }

  /**
   * @deprecated
   */
  get cullDistanceSq(): number {
    return this._cullDistanceSq;
  }

  /**
   * @deprecated
   */
  get cullDistance(): number {
    return Math.sqrt(this._cullDistanceSq);
  }
  set cullDistance(val: number) {
    this._cullDistanceSq = val * val;
  }

  /**
   * @deprecated
   */
  get renderPassFlag(): MaskList {
    return this._renderPassFlag;
  }
  set renderPassFlag(val: MaskList) {
    this._renderPassFlag = val;
  }

  /**
   * @deprecated
   * 设置通过的 Pass Mask，
   * @param  {PassMask} masks 各个 mask
   */
  public setPassMasks(...masks: MaskList[]): void {
    this._passMasks = masks;
    this._renderPassFlag = masks.reduce((a, b) => a | b, 0);
  }

  /**
   * @deprecated
   * 添加 Mask 到通过列表
   * @param  {PassMask} masks 各个 mask
   */
  public addPassMasks(...masks: MaskList[]): void {
    for (const mask of masks) {
      const idx = this._passMasks.indexOf(mask);
      if (idx < 0) {
        this._passMasks.push(mask);
      }
    }

    this.setPassMasks(...this._passMasks);
  }

  /**
   * @deprecated
   * 从当前的通过列表移除 Mask
   * @param  {PassMask} masks 各个 mask
   */
  public removePassMasks(...masks: MaskList[]): void {
    for (const mask of masks) {
      const idx = this._passMasks.indexOf(mask);
      if (idx > -1) {
        this._passMasks.splice(idx, 1);
      }
    }

    this.setPassMasks(...this._passMasks);
  }
}
