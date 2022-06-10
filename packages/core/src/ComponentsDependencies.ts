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
   * @internal
   */
  static _register(currentComponent: ComponentConstructor, dependentComponent: ComponentConstructor): void {
    this._addDependency(currentComponent, dependentComponent, this._dependenciesMap);
    this._addDependency(dependentComponent, currentComponent, this._invDependenciesMap);
  }

  /**
   * @internal
   */
  static _addCheck(entity: Entity, type: ComponentConstructor): void {
    // Check if there are dependent components.
    const dependentComponents = ComponentsDependencies._dependenciesMap.get(type);
    if (dependentComponents) {
      for (let i = 0, n = dependentComponents.length; i < n; i++) {
        const dependentComponent = dependentComponents[i];
        if (!entity.getComponent(dependentComponent)) {
          entity.addComponent(dependentComponent);
        }
      }
    }
  }

  /**
   * @internal
   */
  static _removeCheck(entity: Entity, type: ComponentConstructor): void {
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
    map: Map<ComponentConstructor, ComponentConstructor[]>
  ): void {
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

/**
 * Dependent components, automatically added if they do not exist.
 * @param components -  Dependent components
 */
export function dependentComponents(...components: ComponentConstructor[]) {
  return function <T extends ComponentConstructor>(target: T): void {
    components.forEach((component) => ComponentsDependencies._register(target, component));
  };
}
