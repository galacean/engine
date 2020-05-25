import { NodeAbility } from "../NodeAbility";

/**
 * 节点类,可作为组件的容器。
 */
export class Node {
  /** 名字。 */
  name: string;

  /**
   * 是否局部激活。
   */
  get active(): boolean {
    return false;
  }
  set active(value: boolean) {}

  /**
   * 在层级中是否处于激活状态。
   */
  get activeInHierarchy(): boolean {
    return false;
  }

  /**
   * 父变换。
   */
  get parent(): Node {
    return null;
  }
  set parent(value: Node) {}

  /**
   * 子变换数量。
   */
  get childCount(): number {
    return 0;
  }

  /**
   * 根据组件类型添加组件。
   * @returns	组件实例
   */
  addComponent<T extends NodeAbility>(): T {
    return null;
  }

  /**
   * 根据组件类型获取组件。
   * @returns	组件实例
   */
  getComponent<T extends NodeAbility>(): T {
    return null;
  }

  /**
   * 根据组件类型获取组件集合。
   * @returns	组件实例集合
   */
  getComponents<T extends NodeAbility>(results: Array<T>): void {}

  /**
   * 根据索引获取子节点。
   * @param index - 索引
   * @returns 节点
   */
  getChild(index: number): Node {
    return null;
  }

  /**
   * 根据名字查找子节点。
   * @param name - 名字
   * @returns 节点
   */
  findChild(name: string): Node {
    return null;
  }

  /**
   * 清空子节点。
   */
  clearChildren(): void {}

  /**
   * 销毁。
   */
  destroy(): void {}
}
