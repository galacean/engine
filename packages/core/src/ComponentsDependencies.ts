import { Component } from "./Component";
import { Entity } from "./Entity";

type ComponentConstructor = new (entity: Entity) => Component;

/**
 * Used for component dependency registration.
 */
export class ComponentsDependencies {
  /**
   * @internal
   */
  private static _dependenciesMap = new Map<ComponentConstructor, ComponentConstructor[]>();
  private static _invDependenciesMap = new Map<ComponentConstructor, ComponentConstructor[]>();

  /**
   * Register component dependencies.
   * @param currentComponent - The component you want to be register.
   * @param dependentComponent - The component's dependencies.
   */
  static register(currentComponent: ComponentConstructor, dependentComponent: ComponentConstructor) {
    this._addDependency(currentComponent, dependentComponent, this._dependenciesMap);
    this._addDependency(dependentComponent, currentComponent, this._invDependenciesMap);
  }

  /**
   * @internal
   */
  static _addCheck(entity: Entity, type: ComponentConstructor) {
    // Check if there are dependent components.
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
    const invDependencies = ComponentsDependencies._invDependenciesMap.get(type);
    if (invDependencies) {
      for (let i = 0, len = invDependencies.length; i < len; i++) {
        if (entity.getComponent(invDependencies[i])) {
          throw `you should remove ${invDependencies[i]} before adding ${type}`;
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
