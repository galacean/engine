import { NodeAbility } from "./NodeAbility";

/**
 * 脚本类，可进行逻辑编写。
 */
export class Script extends NodeAbility {
  /* @internal */
  _started: boolean = false;
  /* @internal */
  _onUpdateIndex: number = -1;
  /* @internal */
  _onLateUpdateIndex: number = -1;
  /* @internal */
  _onPreRenderIndex: number = -1;
  /* @internal */
  _onPostRenderIndex: number = -1;

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
   * @param deltaTime 间隔时间 @deprecated
   */
  onUpdate(deltaTime: number): void {}

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
  _onDisable(): void {
    this.onDisable();
  }

  /**
   * @internal
   * @inheritDoc
   * @override
   */
  _onActive(): void {
    const componentsManager = this.scene._componentsManager;
    const prototype = Script.prototype;
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
  }

  /**
   * @internal
   * @inheritDoc
   * @override
   */
  _onInActive(): void {
    const componentsManager = this.scene._componentsManager;
    const prototype = Script.prototype;
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
