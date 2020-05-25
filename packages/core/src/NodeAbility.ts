import { Event, EventDispatcher, MaskList } from "@alipay/o3-base";
import { Node } from "./Node";
import { Engine } from "./Engine";
import { Scene } from "./Scene";
import { mat4Type } from "./type";

/**
 * 所有组件的基类。
 */
export class NodeAbility extends EventDispatcher {
  /**
   * 是否激活
   */
  get enabled(): boolean {
    return this._enabled;
  }

  set enabled(val: boolean) {
    if (val === this._enabled) {
      return;
    }

    this._enabled = val;
    if (val && this._started) {
      this.trigger(new Event("enabled", this));
    } else {
      this.trigger(new Event("disabled", this));
    }
  }

  /**
   * 所属节点对象。
   */
  get node(): Node {
    return this._ownerNode;
  }

  /**
   * 所属场景对象。
   */
  get scene(): Scene {
    return this._ownerNode.scene;
  }

  public _props: object;
  public _ownerNode: Node;
  public _renderable: boolean;
  protected _started: boolean = false;
  private _enabled: boolean = true;
  private _pendingDestroy: boolean;
  private _renderPriority: number;
  private _renderPassFlag: MaskList;
  private _passMasks: MaskList[];
  private _cullDistanceSq: number;

  /**
   * 构造函数
   * @param {Node} node 对象所在节点
   * @param {Object} props  配置参数
   */
  constructor(node: Node, props: object = {}) {
    super();

    this._props = props;
    this._ownerNode = node;
    this._renderable = false;
    this._pendingDestroy = false;
    this._renderPriority = 0;
    this._renderPassFlag = MaskList.EVERYTHING;
    this._passMasks = [MaskList.EVERYTHING];
    this._cullDistanceSq = 0; // 等于0，代表不进行 distance cull
  }

  /**
   * 销毁本组件对象
   */
  public destroy(): void {
    this._pendingDestroy = true;

    this.trigger(new Event("disabled", this));
    this.trigger(new Event("destroy", this));
  }

  //---------------------------------------------Deprecated-----------------------------------------------------------------

  /**
   * @deprecated
   * 所属的Engine对象
   * @member {Engine}
   * @readonly
   */
  get engine(): Engine {
    return this._ownerNode.scene.engine;
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
    return this._ownerNode.getModelMatrix();
  }

  /**
   * @deprecated
   */
  get invModelMatrix(): mat4Type {
    return this._ownerNode.getInvModelMatrix();
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

  /**
   * @deprecated
   */
  public onUpdate(deltaTime: number): void {}

  /**
   * @deprecated
   * 每帧调用，第一次调用会回调this.onStart()方法
   */
  public update(deltaTime: number): void {
    if (!this._started) {
      this._started = true;

      if (this.onStart) {
        this.onStart.call(this);
      }

      this.trigger(new Event("start", this));

      if (this._enabled) {
        this.trigger(new Event("enabled", this));
      }
    }

    this.onUpdate(deltaTime);
  }

  /**
   * @deprecated
   * 是否被销毁
   * @member {boolean}
   * @readonly
   * @private
   */
  get isPendingDestroy() {
    return this._pendingDestroy;
  }

  /**
   * @deprecated
   * 增加 parent 属性，主要是提供给事件的冒泡机制使用
   */
  get parent(): Node {
    return this._ownerNode;
  }
}
