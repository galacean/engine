import { Node } from "./../Node";
import { Engine } from "../Engine";

/**
 * 场景类。
 */
export class Scene {
  private _rootNodesCount: number = 0;

  /** @internal */
  _engine: Engine;

  /** 场景名字。 */
  name: string;

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
   * 添加根节点。
   * @param node - 根节点
   */
  addRootNode(node: Node): void {}

  /**
   * 移除根节点。
   * @param node - 根节点
   */
  removeRootNode(node: Node): void {}

  /**
   * 通过索引获取根节点。
   * @param index - 索引
   */
  getRootNode(index: number): Node {
    return null;
  }

  /**
   * 销毁场景。
   */
  destroy(): void {
    this._engine.sceneManager.removeScene(this);
    //继续销毁所有根节点
  }
}
