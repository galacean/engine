import { Component } from "./Component";
import { ComponentConstructor, Entity } from "./Entity";

/**
 * @internal
 * Used for component dependency registration.
 */
export class ComponentsDependencies {
  private static _invDependenciesMap = new Map<ComponentConstructor, ComponentConstructor[]>();

  static _dependenciesMap = new Map<ComponentConstructor, DependentInfo>();

  /**
   * @internal
   */
  static _addCheck(entity: Entity, type: ComponentConstructor): void {
    while (type !== Component) {
      const dependentInfo = ComponentsDependencies._dependenciesMap.get(type);
      if (dependentInfo) {
        const { components, mode } = dependentInfo;
        for (let i = 0, n = components.length; i < n; i++) {
          const dependentComponent = components[i];
          if (!entity.getComponent(dependentComponent)) {
            if (mode === DependentMode.AutoAdd) {
              entity.addComponent(dependentComponent);
            } else {
              throw `Should add ${dependentComponent.name} before adding ${type.name}`;
            }
          }
        }
      }
      type = Object.getPrototypeOf(type);
    }
  }

  /**
   * @internal
   * Invoke `onAdd` for each index in `types`, adding any unsatisfied dependency that appears later in `types`
   * before the component that requires it while preserving the original order otherwise.
   */
  static _forEachInAddOrder(
    entity: Entity,
    types: readonly ComponentConstructor[],
    onAdd: (index: number) => void
  ): void {
    const n = types.length;
    if (n === 0) return;
    if (n === 1) {
      onAdd(0);
      return;
    }

    // 0 = unvisited, 1 = visiting (cycle guard), 2 = visited
    const state = new Uint8Array(n);
    const visit = (index: number): void => {
      if (state[index] !== 0) return;
      state[index] = 1;

      let type: ComponentConstructor = types[index];
      while (type && type !== Component) {
        const dependentInfo = ComponentsDependencies._dependenciesMap.get(type);
        if (dependentInfo) {
          const { components } = dependentInfo;
          for (let i = 0, len = components.length; i < len; i++) {
            const dep = components[i];
            if (!entity.getComponent(dep)) {
              for (let j = 0; j < n; j++) {
                if (state[j] === 0 && (types[j] === dep || types[j].prototype instanceof dep)) {
                  visit(j);
                  break;
                }
              }
            }
          }
        }
        type = Object.getPrototypeOf(type);
      }

      state[index] = 2;
      onAdd(index);
    };

    for (let i = 0; i < n; i++) {
      visit(i);
    }
  }

  /**
   * @internal
   * Invoke `onRemove` for each index in `components`, removing any dependent component in `components`
   * on the same entity before the dependencies it requires while preserving the original order otherwise.
   */
  static _forEachInRemoveOrder(components: readonly Component[], onRemove: (index: number) => void): void {
    const n = components.length;
    if (n === 0) return;
    if (n === 1) {
      onRemove(0);
      return;
    }

    // 0 = unvisited, 1 = visiting (cycle guard), 2 = visited
    const state = new Uint8Array(n);
    const visit = (index: number): void => {
      if (state[index] !== 0) return;
      state[index] = 1;

      const entity = components[index].entity;
      let type = components[index].constructor as ComponentConstructor;
      while (type && type !== Component) {
        const invDeps = ComponentsDependencies._invDependenciesMap.get(type);
        if (invDeps) {
          for (let i = 0, len = invDeps.length; i < len; i++) {
            const dependent = invDeps[i];
            for (let j = 0; j < n; j++) {
              if (state[j] === 0 && components[j].entity === entity && components[j] instanceof dependent) {
                visit(j);
              }
            }
          }
        }
        type = Object.getPrototypeOf(type);
      }

      state[index] = 2;
      onRemove(index);
    };

    for (let i = 0; i < n; i++) {
      visit(i);
    }
  }

  /**
   * @internal
   */
  static _hasDependencies(type: ComponentConstructor): boolean {
    while (type !== Component) {
      if (ComponentsDependencies._dependenciesMap.has(type)) {
        return true;
      }
      type = Object.getPrototypeOf(type);
    }
    return false;
  }

  /**
   * @internal
   */
  static _removeCheck(entity: Entity, type: ComponentConstructor, replace?: ComponentConstructor): void {
    const components = entity._components;
    const n = components.length;
    while (type !== Component) {
      // The replacement still satisfies this type and all of its base types
      if (replace && (replace === type || replace.prototype instanceof type)) {
        return;
      }
      let count = 0;
      for (let i = 0; i < n; i++) {
        if (components[i] instanceof type && ++count > 1) return;
      }
      const invDependencies = ComponentsDependencies._invDependenciesMap.get(type);
      if (invDependencies) {
        for (let i = 0, len = invDependencies.length; i < len; i++) {
          if (entity.getComponent(invDependencies[i])) {
            throw `Should remove ${invDependencies[i].name} before remove ${type.name}`;
          }
        }
      }
      type = Object.getPrototypeOf(type);
    }
  }

  /**
   * @internal
   */
  static _addDependency(
    targetInfo: DependentInfo,
    dependentComponent: ComponentConstructor,
    map: Map<DependentInfo, ComponentConstructor[]>
  ): void {
    const components = map.get(targetInfo);
    if (!components) {
      map.set(targetInfo, [dependentComponent]);
    } else {
      components.includes(dependentComponent) || components.push(dependentComponent);
    }
  }

  /**
   * @internal
   */
  static _addInvDependency(currentComponent: ComponentConstructor, dependentComponent: ComponentConstructor): void {
    const map = this._invDependenciesMap;
    const components = map.get(currentComponent);
    if (!components) {
      map.set(currentComponent, [dependentComponent]);
    } else {
      components.includes(dependentComponent) || components.push(dependentComponent);
    }
  }

  private constructor() {}
}

/**
 * Declare dependent component.
 * @param component - Dependent component
 * @param dependentMode - Dependent mode
 */
export function dependentComponents(component: ComponentConstructor, dependentMode?: DependentMode);

/**
 * Declare dependent components.
 * @param components - Dependent components
 * @param dependentMode - Dependent mode
 */
export function dependentComponents(components: ComponentConstructor[], dependentMode?: DependentMode);

export function dependentComponents(
  componentOrComponents: ComponentConstructor | ComponentConstructor[],
  dependentMode: DependentMode = DependentMode.CheckOnly
) {
  const components = Array.isArray(componentOrComponents) ? componentOrComponents : [componentOrComponents];

  return function <T extends ComponentConstructor>(target: T): void {
    ComponentsDependencies._dependenciesMap.set(target, { mode: dependentMode, components });
    components.forEach((component) => ComponentsDependencies._addInvDependency(component, target));
  };
}

/**
 * Dependent mode.
 */
export enum DependentMode {
  /** Check only, throw error if dependent components do not exist. */
  CheckOnly,
  /** Auto add if dependent components do not exist. */
  AutoAdd
}

/**
 * @internal
 */
interface DependentInfo {
  mode: DependentMode;
  components: ComponentConstructor[];
}
