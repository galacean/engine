import { Node } from "./Node";
import { NodeAbility } from "./NodeAbility";

/**
 * 脚本类，可进行逻辑编写。
 */
export class Script extends NodeAbility {
  public _needCalledFuncs: { [key: string]: boolean };
  protected _started: boolean = false;
  constructor(node: Node, props: object = {}) {
    super(node, props);
    this._isScript = true;
    this._needCalledFuncs = {};
  }
  /**
   *  @internal
   */
  _isOverridedFunc(funcName) {
    if (this[funcName] !== Script.prototype[funcName]) return true;
    return false;
  }
  /**
   * @internal
   * @inheritDoc
   * @override
   */
  _onAwake(): void {
    this.onAwake();
  }
  /**
   * @internal
   * @inheritDoc
   * @override
   */
  _onEnable(): void {
    const funcsName = ["onStart", "onUpdate", "onLateUpdate", "onPreRender", "onPostRender"];
    funcsName.forEach(funcName => {
      if (this._isOverridedFunc[funcName]) {
        this._needCalledFuncs[funcName] = true;
      }
    });
    this.onEnable();
  }

  _onDisable(): void {
    this._needCalledFuncs = {};
    this.onDisable();
  }

  _onDestroy(): void {
    this.onDisable();
  }

  /**
   * 脚本第一次被激活时调用,而且只调用一次。
   */
  onAwake(): void {}

  /**
   * 当节点触发为活动状态时调用。
   */
  onEnable(): void {}

  /**
   * 首次调用Update之前调用。
   */
  onStart(): void {}

  /**
   * 更新，在执行引擎逻辑处理之前调用，逐帧调用。
   */
  onUpdate(): void {}

  /**
   * 延迟更新，在执行引擎逻辑处理后调用，逐帧调用。
   */
  onLateUpdate(): void {}

  /**
   * 相机渲染前调用。
   */
  onPreRender(): void {}

  /**
   * 相机完成渲染后调用。
   */
  onPostRender(): void {}

  /**
   * 当节点触发为非活动状态时调用。
   */
  onDisable(): void {}

  /**
   * 销毁时调用。
   */
  onDestroy(): void {}
}
