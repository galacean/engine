import { Component } from "./Component";
import { Node } from "./Node";

type componentConstructor = { new (...args: any): Component };

/**
 * 用于组件依赖注册。
 */
export class ComponentsDependencies {
  /**
   * @internal
   */
  private static _dependenciesMap = new Map<componentConstructor, componentConstructor[]>();
  private static _invDependenciesMap = new Map<componentConstructor, componentConstructor[]>();

  /**
   * 注册组件依赖关系。
   * @param currentComponent
   * @param dependentComponent
   */
  static register(currentComponent: componentConstructor, dependentComponent: componentConstructor) {
    this._addDependency(currentComponent, dependentComponent, this._dependenciesMap);
    this._addDependency(dependentComponent, currentComponent, this._invDependenciesMap);
  }

  /**
   * @internal
   */
  static _addCheck(node: Node, type: componentConstructor) {
    // 检查是否有被依赖组件
    const dependencies = ComponentsDependencies._dependenciesMap.get(type);
    if (dependencies) {
      for (let i = 0, len = dependencies.length; i < len; i++) {
        if (!node.getComponent(dependencies[i])) {
          throw `you should add ${dependencies[i]} before adding ${type}`;
        }
      }
    }
  }

  /**
   * @internal
   */
  static _removeCheck(node: Node, type: componentConstructor) {
    const invDenpendencies = ComponentsDependencies._invDependenciesMap.get(type);
    if (invDenpendencies) {
      for (let i = 0, len = invDenpendencies.length; i < len; i++) {
        if (node.getComponent(invDenpendencies[i])) {
          throw `you should remove ${invDenpendencies[i]} before adding ${type}`;
        }
      }
    }
  }

  private static _addDependency(
    currentComponent: componentConstructor,
    dependentComponent: componentConstructor,
    map: Map<any, any>
  ) {
    let components = map.get(currentComponent);
    if (!components) {
      components = [];
      map.set(currentComponent, components);
    }
    if (components.indexOf(dependentComponent) === -1) {
      components.push(dependentComponent);
    }
  }

  private constructor() {}
}

export function dependencies(...abilityClass: componentConstructor[]) {
  return function <T extends componentConstructor>(target: T): void {
    abilityClass.forEach((ability) => ComponentsDependencies.register(target, ability));
  };
}
