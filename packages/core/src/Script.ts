import { NodeAbility } from "./NodeAbility";

/**
 * 脚本类，可进行逻辑编写。
 * CM:我们最后一起严格校对一下生命周期函数的执行顺序
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
  _onStart(): void {
    this._started = true;
    this.onStart();
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
    if (this.onUpdate !== Script.prototype.onUpdate) {
      componentsManager.addOnUpdateScript(this);
    }
    if (this.onLateUpdate !== Script.prototype.onLateUpdate) {
      componentsManager.addOnLateUpdateScript(this);
    }
    if (this.onPreRender !== Script.prototype.onPreRender) {
      componentsManager.addOnPreRenderScript(this);
    }
    if (this.onPostRender !== Script.prototype.onPostRender) {
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
    if (this.onUpdate !== Script.prototype.onUpdate) {
      componentsManager.removeOnUpdateScript(this);
    }
    if (this.onLateUpdate !== Script.prototype.onLateUpdate) {
      componentsManager.removeOnLateUpdateScript(this);
    }
    if (this.onPreRender !== Script.prototype.onPreRender) {
      componentsManager.removeOnPreRenderScript(this);
    }
    if (this.onPostRender !== Script.prototype.onPostRender) {
      componentsManager.removeOnPostRenderScript(this);
    }
  }

  /**
   * @internal
   * @inheritDoc
   * @override
   */
  _onDestroy(): void {
    //CM:这不死循环了
    //CM:nDestroy需要在脚本生命周期的最后一帧调用，可以在ComponentManager加一个数组叫“销毁队列”，然后在一帧的最后统一调用，有人调用组件的destroy就塞到队列里
    this._onDestroy();
  }
}
