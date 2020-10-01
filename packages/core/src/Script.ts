import { Component } from "./Component";
import { Camera } from "./Camera";

/**
 * 脚本类，可进行逻辑编写。
 */
export class Script extends Component {
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
   * 主更新，逐帧调用。
   * @param deltaTime - 帧间隔时间
   */
  onUpdate(deltaTime: number): void {}

  /**
   * 延迟更新，逐帧调用。
   * @param deltaTime - 帧间隔时间
   */
  onLateUpdate(deltaTime: number): void {}

  /**
   * 相机渲染前调用，逐相机调用。
   * @param camera - 当前渲染相机
   */
  onBeginRender(camera: Camera): void {}

  /**
   * 相机完成渲染后调用，逐相机调用。
   * @param camera - 当前渲染相机
   */
  onEndRender(camera: Camera): void {}

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
    const componentsManager = this.engine._componentsManager;
    const prototype = Script.prototype;
    if (!this._started) {
      componentsManager.addOnStartScript(this);
    }
    if (this.onUpdate !== prototype.onUpdate) {
      componentsManager.addOnUpdateScript(this);
    }
    if (this.onLateUpdate !== prototype.onLateUpdate) {
      componentsManager.addOnLateUpdateScript(this);
    }
    this.onEnable();
  }

  /**
   * @internal
   * @inheritDoc
   * @override
   */
  _onDisable(): void {
    const componentsManager = this.engine._componentsManager;
    const prototype = Script.prototype;
    /**
     * use onStartIndex is more safe,
     * even is not start, but maybe it still not in the queue,for example write "entity.isActive = false" in onWake().
     */
    if (this._onStartIndex !== -1) {
      componentsManager.removeOnStartScript(this);
    }
    if (this.onUpdate !== prototype.onUpdate) {
      componentsManager.removeOnUpdateScript(this);
    }
    if (this.onLateUpdate !== prototype.onLateUpdate) {
      componentsManager.removeOnLateUpdateScript(this);
    }
    this.onDisable();
  }

  /**
   * @internal
   * @inheritDoc
   * @override
   */
  _onDestroy(): void {
    this.engine._componentsManager.addDestoryComponent(this);
  }
}
