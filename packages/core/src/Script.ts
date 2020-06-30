import { NodeAbility } from "./NodeAbility";

/**
 * 脚本类，可进行逻辑编写。
 */
export class Script extends NodeAbility {
  /* @internal */
  _started: boolean = false;
  /* @internal */
  _onStartIndex: number = -1;
  /* @internal */
  _onUpdateIndex: number = -1;
  /* @internal */
  _onLateUpdateIndex: number = -1;
  /* @internal */
  _onPreRenderIndex: number = -1;
  /* @internal */
  _onPostRenderIndex: number = -1;

  /**
   * 第一次触发可用状态时调用,只调用一次。
   */
  onAwake(): void {}

  /**
   * 触发为可用状态时调用。
   */
  onEnable(): void {}

  /**
   * 第一次执行帧级循环前调用，只调用一次。
   */
  onStart(): void {}

  /**
   * 主更新，在执行内部动画逻辑前调用，逐帧调用。
   * @param deltaTime 间隔时间 @deprecated
   */
  onUpdate(deltaTime: number): void {}

  /**
   * 延迟更新，在执行内部动画逻辑后调用，逐帧调用。
   */
  onLateUpdate(): void {}

  /**
   * 相机渲染前调用，逐相机调用。
   */
  onPreRender(): void {}

  /**
   * 相机完成渲染后调用，逐相机调用。
   */
  onPostRender(): void {}

  /**
   * 触发为禁用状态时调用。
   */
  onDisable(): void {}

  /**
   * 在被销毁帧的最后调用。
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
    const componentsManager = this.scene._componentsManager;
    const prototype = Script.prototype;
    if (!this._started && this.onStart !== prototype.onStart) {
      componentsManager.addOnStartScript(this);
    }
    if (this.onUpdate !== prototype.onUpdate) {
      componentsManager.addOnUpdateScript(this);
    }
    if (this.onLateUpdate !== prototype.onLateUpdate) {
      componentsManager.addOnLateUpdateScript(this);
    }
    if (this.onPreRender !== prototype.onPreRender) {
      componentsManager.addOnPreRenderScript(this);
    }
    if (this.onPostRender !== prototype.onPostRender) {
      componentsManager.addOnPostRenderScript(this);
    }
    this.onEnable();
  }

  /**
   * @internal
   * @inheritDoc
   * @override
   */
  _onDisable(): void {
    const componentsManager = this.scene._componentsManager;
    const prototype = Script.prototype;
    if (!this._started && this.onStart !== prototype.onStart) {
      componentsManager.removeOnStartScript(this);
    }
    if (this.onUpdate !== prototype.onUpdate) {
      componentsManager.removeOnUpdateScript(this);
    }
    if (this.onLateUpdate !== prototype.onLateUpdate) {
      componentsManager.removeOnLateUpdateScript(this);
    }
    if (this.onPreRender !== prototype.onPreRender) {
      componentsManager.removeOnPreRenderScript(this);
    }
    if (this.onPostRender !== prototype.onPostRender) {
      componentsManager.removeOnPostRenderScript(this);
    }
    this.onDisable();
  }

  /**
   * @internal
   * @inheritDoc
   * @override
   */
  _onDestroy(): void {
    this.scene._componentsManager.addDestoryComponent(this);
  }
}
