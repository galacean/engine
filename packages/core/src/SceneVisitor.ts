import { NodeAbility } from "./NodeAbility";
import { Node } from "./Node";

/**
 * Scene 访问者接口
 */
export abstract class SceneVisitor {
  /**
   * 接受一个 Node
   * @return {boolean} 返回 false，则忽略本节点及其所有子节点
   */
  public abstract acceptNode(node: Node): boolean;

  /**
   * 接受一个节点的组件
   * @param {NodeAbility} nodeAbility
   */
  public abstract acceptAbility(nodeAbility: NodeAbility);
}
