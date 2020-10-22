import { Component } from "./Component";
import { Entity } from "./Entity";

type ComponentConstructor = new (entity: Entity) => Component;

/**
 * 用于组件依赖注册。
 */
export class ComponentsDependencies {
  /**
   * @internal
   */
  private static _dependenciesMap = new Map<ComponentConstructor, ComponentConstructor[]>();
  private static _invDependenciesMap = new Map<ComponentConstructor, ComponentConstructor[]>();

  /**
   * 注册组件依赖关系。
   * @param currentComponent
   * @param dependentComponent
   */
  static register(currentComponent: ComponentConstructor, dependentComponent: ComponentConstructor) {
    this._addDependency(currentComponent, dependentComponent, this._dependenciesMap);
    this._addDependency(dependentComponent, currentComponent, this._invDependenciesMap);
  }

  /**
   * @internal
   */
  static _addCheck(entity: Entity, type: ComponentConstructor) {
    // 检查是否有被依赖组件
    const dependencies = ComponentsDependencies._dependenciesMap.get(type);
    if (dependencies) {
      for (let i = 0, len = dependencies.length; i < len; i++) {
        if (!entity.getComponent(dependencies[i])) {
          throw `you should add ${dependencies[i]} before adding ${type}`;
        }
      }
    }
  }

  /**
   * @internal
   */
  static _removeCheck(entity: Entity, type: ComponentConstructor) {
    const invDenpendencies = ComponentsDependencies._invDependenciesMap.get(type);
    if (invDenpendencies) {
      for (let i = 0, len = invDenpendencies.length; i < len; i++) {
        if (entity.getComponent(invDenpendencies[i])) {
          throw `you should remove ${invDenpendencies[i]} before adding ${type}`;
        }
      }
    }
  }

  private static _addDependency(
    currentComponent: ComponentConstructor,
    dependentComponent: ComponentConstructor,
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

export function dependencies(...abilityClass: ComponentConstructor[]) {
  return function <T extends ComponentConstructor>(target: T): void {
    abilityClass.forEach((ability) => ComponentsDependencies.register(target, ability));
  };
}
