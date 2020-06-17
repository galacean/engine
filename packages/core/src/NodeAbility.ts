import { Event, EventDispatcher, MaskList } from "@alipay/o3-base";
import { Node } from "./Node";
import { Engine } from "./Engine";
import { Scene } from "./Scene";
import { mat4Type } from "./type";

/**
 * TODO:命名暂时保留兼容性，未来替换为Component
 * 所有组件的基类。
 */
export abstract class NodeAbility extends EventDispatcher {
  /* @internal */
  _props: object;
  /* @internal */
  _node: Node;
  /* @internal */
  _destroyed: boolean = false;
  /* @internal */
  _onUpdateIndex: number = -1;
  /* @internal */
  protected _overrideOnUpdate: boolean = false;
  /* @internal */
  protected _overrideUpdate: boolean = false;

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
      this._node.activeInHierarchy && this._onEnable();
    } else {
      this._node.activeInHierarchy && this._onDisable();
    }
    // @deprecated
    if (value) {
      if (this._started) {
        this.trigger(new Event("enabled", this));
      }
    } else {
      this.trigger(new Event("disabled", this));
    }
  }

  /**
   * 所属节点对象。
   */
  get node(): Node {
    return this._node;
  }

  /**
   * 创建组件实例。
   * @param node - 对象所在节点
   * @param props - 配置参数
   */
  constructor(node: Node, props: object = {}) {
    super();
    this._props = props;
    this._node = node;

    this._renderPassFlag = MaskList.EVERYTHING; // @deprecated
    this._passMasks = [MaskList.EVERYTHING]; // @deprecated
    const prototype = NodeAbility.prototype;
    this._overrideOnUpdate = this.onUpdate !== NodeAbility.prototype.onUpdate;
    this._overrideUpdate = this.update !== NodeAbility.prototype.update;
  }

  /**
   * 销毁本组件对象
   */
  destroy(): void {
    if (!this._destroyed) return;
    if (this._node.activeInHierarchy) {
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
  _onActive(): void {
    if (this._overrideOnUpdate || this._overrideUpdate) {
      //@deprecated 兼容
      if (this._overrideUpdate) {
        this.onUpdate = this.update;
      }
      this.scene._componentsManager.addOnUpdateComponent(this);
    }
  }

  /**
   * @internal
   */
  _onInActive(): void {
    if (this._overrideOnUpdate || this._overrideUpdate) {
      this.scene._componentsManager.removeOnUpdateComponent(this);
    }
  }

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
    return this._node.scene;
  }

  //---------------------------------------------Deprecated-----------------------------------------------------------------

  /* @internal */
  _started: boolean = false;

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
    return this._node.scene.engine;
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
  get started(): boolean {
    return this._started;
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
  get modelMatrix(): mat4Type {
    return this._node.getModelMatrix();
  }

  /**
   * @deprecated
   */
  get invModelMatrix(): mat4Type {
    return this._node.getInvModelMatrix();
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
   */
  public onStart(): void {}

  // /**
  //  * @deprecated
  //  */
  public onUpdate(deltaTime: number): void {}

  // /**
  //  * @deprecated
  //  * 每帧调用，第一次调用会回调this.onStart()方法
  //  */
  public update(deltaTime: number): void {}

  /**
   * @deprecated
   * 增加 parent 属性，主要是提供给事件的冒泡机制使用
   */
  get parent(): Node {
    return this._node;
  }
}
