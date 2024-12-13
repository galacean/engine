import { Component } from "./Component";
import { Entity } from "./Entity";

type ComponentConstructor = new (entity: Entity) => Component;

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
   */
  static _removeCheck(entity: Entity, type: ComponentConstructor): void {
    while (type !== Component) {
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
    let components = map.get(targetInfo);
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
    let components = map.get(currentComponent);
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
