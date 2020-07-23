import { Entity } from "../Entity";
import { Engine } from "../Engine";

/**
 * 场景类。
 */
export class Scene {
  /** 场景名字。 */
  name: string;

  /** @internal */
  _engine: Engine;

  private _isActive: boolean = true;
  private _destroyed: boolean = false;
  private _rootNodesCount: number = 0;

  /**
   * 所属引擎。
   */
  get engine(): Engine {
    return this._engine;
  }

  /**
   * 根节点的数量。
   */
  get rootNodesCount(): number {
    return this._rootNodesCount;
  }

  /**
   * 局部激活。
   */
  get isActive(): boolean {
    return this._isActive;
  }

  /**
   * 是否已销毁。
   */
  get destroyed(): boolean {
    return this._destroyed;
  }

  /**
   * 创建场景。
   * @param name - 名字
   * @param engine - 所属引擎
   */
  constructor(name?: string, engine?: Engine) {
    //CM:实现需要考虑当前激活场景切换和增加/删除根节点 导致的节点激活状态变化
  }

  /**
   * 添加根节点。
   * @param node - 根节点
   */
  addRootNode(node: Entity): void {}

  /**
   * 移除根节点。
   * @param node - 根节点
   */
  removeRootNode(node: Entity): void {}

  /**
   * 通过索引获取根节点。
   * @param index - 索引
   */
  getRootNode(index: number): Entity {
    return null;
  }

  /**
   * 销毁场景。
   */
  destroy(): void {
    if (this._engine.sceneManager.scene === this) this._engine.sceneManager.scene = null;
    //继续销毁所有根节点
  }
}
