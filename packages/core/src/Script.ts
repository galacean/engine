import { Node } from "./Node";
import { NodeAbility } from "./NodeAbility";

/**
 * 脚本类，可进行逻辑编写。
 */
export class Script extends NodeAbility {
  /* @internal */
  _started: boolean = false;

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
    this.onEnable();
  }

  /**
   * @internal
   * @inheritDoc
   * @override
   */
  _onStart(): void {
    this._started = true;
    this.onStart();
  }

  _onDisable(): void {
    this.onDisable();
  }

  _onActive(): void {
    if (this.onUpdate !== Script.prototype.onUpdate) {
      this.scene._componentsManager.addScript("onUpdate", this); //CM：this.scene._componentsManager 提出来吧
    }
    if (this.onLateUpdate !== Script.prototype.onLateUpdate) {
      this.scene._componentsManager.addScript("onLateUpdate", this);
    }
    if (this.onPreRender !== Script.prototype.onPreRender) {
      this.scene._componentsManager.addScript("onPreRender", this);
    }
    if (this.onPostRender !== Script.prototype.onPostRender) {
      this.scene._componentsManager.addScript("onPostRender", this);
    }
  }

  _onInActive(): void {
    if (this.onUpdate !== Script.prototype.onUpdate) {
      this.scene._componentsManager.removeScript("onUpdate", this);
    }
    if (this.onLateUpdate !== Script.prototype.onLateUpdate) {
      this.scene._componentsManager.removeScript("onLateUpdate", this);
    }
    if (this.onPreRender !== Script.prototype.onPreRender) {
      this.scene._componentsManager.removeScript("onPreRender", this);
    }
    if (this.onPostRender !== Script.prototype.onPostRender) {
      this.scene._componentsManager.removeScript("onPostRender", this);
    }
  }

  _onDestroy(): void {
    if (this.onUpdate !== Script.prototype.onUpdate) {
      this.scene._componentsManager.removeScript("onUpdate", this);
    }
    if (this.onLateUpdate !== Script.prototype.onLateUpdate) {
      this.scene._componentsManager.removeScript("onLateUpdate", this);
    }
    if (this.onPreRender !== Script.prototype.onPreRender) {
      this.scene._componentsManager.removeScript("onPreRender", this);
    }
    if (this.onPostRender !== Script.prototype.onPostRender) {
      this.scene._componentsManager.removeScript("onPostRender", this);
    }
    this._onDestroy();
  }
}
