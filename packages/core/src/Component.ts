import { Event, EventDispatcher, MaskList } from "@alipay/o3-base";
import { Matrix4 } from "@alipay/o3-math/types/type";
import { Engine } from "./Engine";
import { Entity } from "./Entity";
import { Scene } from "./Scene";

/**
 * 组件的基类。
 */
export abstract class Component extends EventDispatcher {
  /* @internal */
  _entity: Entity;
  /* @internal */
  _destroyed: boolean = false;

  protected _props: object;

  private _enabled: boolean = true;
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
   * 所属节点对象。
   */
  get entity(): Entity {
    return this._entity;
  }

  /**
   * 创建组件实例。
   * @param node - 对象所在节点
   * @param props - 配置参数
   */
  constructor(node: Entity, props: object = {}) {
    super();
    this._props = props;
    this._entity = node;

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
  //--------------------------------------------TobeConfirmed--------------------------------------------------

  /**
   * 所属场景对象。
   */
  get scene(): Scene {
    return this._entity.scene;
  }

  //---------------------------------------------Deprecated-----------------------------------------------------------------

  private _renderPriority: number = 0;
  private _renderPassFlag: MaskList;
  private _passMasks: MaskList[];
  private _cullDistanceSq: number = 0; // 等于0，代表不进行 distance cull

  /* @internal */
  _renderable: boolean = false;

  /**
   * @deprecated
   * 所属的Engine对象
   * @member {Engine}
   * @readonly
   */
  get engine(): Engine {
    return this._entity?.scene?.engine;
  }

  /**
   * @deprecated
   * 是否可渲染
   * @member {boolean}
   * @readonly
   * @private
   */
  get isRenderable() {
    return this._renderable;
  }

  /**
   * @deprecated
   */
  set renderable(val: boolean) {
    this._renderable = val;
  }

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
  get invModelMatrix(): Readonly<Matrix4> {
    return this._entity.getInvModelMatrix();
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

  /**
   * @deprecated
   * 增加 parent 属性，主要是提供给事件的冒泡机制使用
   */
  get parent(): Entity {
    return this._entity;
  }
}
