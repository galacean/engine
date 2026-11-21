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
   * Prefer requested providers before their dependents. If a requested dependency chain is blocked,
   * retry with declared AutoAdd types to avoid exploring combinations of nested providers.
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

    const added = new Uint8Array(n);
    let prerequisites: (number | ComponentConstructor)[] | undefined;
    let resolving: ComponentConstructor[] | undefined;
    const dependencies = ComponentsDependencies._dependenciesMap;
    type DependencyOrder = "batch" | "requested" | "declared";

    const hasProvider = (type: ComponentConstructor): boolean => {
      if (entity.getComponent(type)) return true;
      if (!prerequisites) return false;
      for (let i = 0, count = prerequisites.length; i < count; i++) {
        const planned = prerequisites[i];
        const candidate = typeof planned === "number" ? types[planned] : planned;
        if (candidate === type || candidate.prototype instanceof type) return true;
      }
      return false;
    };

    const prove = (type: ComponentConstructor, index: number, order: DependencyOrder): boolean =>
      order === "batch" ? plan(type, index, "requested") || plan(type, index, "declared") : plan(type, index, order);

    const plan = (type: ComponentConstructor, index: number, order: DependencyOrder): boolean => {
      if (resolving?.includes(type)) return false;
      const required = order === "batch";
      const start = prerequisites?.length ?? 0;
      let stack: ComponentConstructor[] | undefined;
      requirements: for (let current = type; current !== Component; current = Object.getPrototypeOf(current)) {
        const info = dependencies.get(current);
        if (!info) continue;
        const { components, mode } = info;
        for (let i = 0, count = components.length; i < count; i++) {
          const dependency = components[i];
          if (hasProvider(dependency)) continue;
          if (!stack) {
            stack = resolving ||= [];
            stack.push(type);
          }
          let provided = false;
          let autoAdd = mode === DependentMode.AutoAdd;
          const matchSubtype = order !== "declared" || mode === DependentMode.CheckOnly;
          for (let j = 0; j < n; j++) {
            if (added[j]) continue;
            const candidate = types[j];
            if (candidate !== dependency && !(matchSubtype && candidate.prototype instanceof dependency)) continue;
            if (!required || candidate === dependency) autoAdd = false;
            provided = prove(candidate, j, order);
            if (provided || !required) break;
          }
          if (!provided && autoAdd) {
            provided = prove(dependency, -1, order);
          }
          if (!provided) {
            if (required) break requirements;
            // Keep a rejected provider's prerequisites from running their constructors.
            if (prerequisites) prerequisites.length = start;
            stack.pop();
            return false;
          }
        }
      }
      stack?.pop();
      if (required && !prerequisites?.length) {
        onAdd(index);
      } else {
        (prerequisites ||= []).push(index === -1 ? type : index);
      }
      return true;
    };

    for (let i = 0; i < n; i++) {
      if (added[i]) continue;
      added[i] = 1;
      plan(types[i], i, "batch");
      if (!prerequisites?.length) continue;
      for (let j = 0, count = prerequisites.length; j < count; j++) {
        const planned = prerequisites[j];
        if (typeof planned === "number") {
          added[planned] = 1;
          onAdd(planned);
        } else if (!entity.getComponent(planned)) {
          entity.addComponent(planned);
        }
      }
      prerequisites.length = 0;
    }
  }

  /**
   * @internal
   * Remove a dependent before its last provider, preserving source order otherwise.
   * @param components - Stable snapshot of the components selected for removal
   * @param onRemove - Removes the component at the given index from its entity synchronously
   */
  static _forEachInRemoveOrder(components: readonly Component[], onRemove: (index: number) => void): void {
    const n = components.length;
    if (n === 0) return;
    if (n === 1) {
      onRemove(0);
      return;
    }

    const visited = new Uint8Array(n);
    const visit = (index: number): void => {
      if (visited[index]) return;
      visited[index] = 1;

      const component = components[index];
      if (component.destroyed) return;
      const entity = component.entity;
      let type = component.constructor as ComponentConstructor;
      while (type && type !== Component) {
        const invDeps = ComponentsDependencies._invDependenciesMap.get(type);
        if (invDeps) {
          if (ComponentsDependencies._hasAnotherProvider(entity._components, type)) break;
          for (let i = 0, len = invDeps.length; i < len; i++) {
            const dependent = invDeps[i];
            for (let j = 0; j < n; j++) {
              if (!visited[j] && components[j].entity === entity && components[j] instanceof dependent) {
                visit(j);
              }
            }
          }
        }
        type = Object.getPrototypeOf(type);
      }

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

  private static _hasAnotherProvider(components: readonly Component[], type: ComponentConstructor): boolean {
    let count = 0;
    for (let i = 0, n = components.length; i < n; i++) {
      if (components[i] instanceof type && ++count > 1) return true;
    }
    return false;
  }

  /**
   * @internal
   * Verify that removing `type` from `entity` does not leave any surviving component with an unsatisfied dependency.
   * When `replace` supplies a replacement type (or list of types) satisfying a dependency, returns `true` and appends
   * each satisfied `(dependency, dependents)` record to `replacedEntries` when provided.
   */
  static _removeCheck(
    entity: Entity,
    type: ComponentConstructor,
    replace?: ComponentConstructor | readonly ComponentConstructor[],
    replacedEntries?: Array<{ dependency: ComponentConstructor; dependents: Component[] }>
  ): boolean {
    const components = entity._components;
    const n = components.length;
    let usedReplacement = false;
    while (type !== Component) {
      if (typeof replace === "function" && (replace === type || replace.prototype instanceof type)) {
        return true;
      }
      const invDependencies = ComponentsDependencies._invDependenciesMap.get(type);
      if (invDependencies) {
        if (ComponentsDependencies._hasAnotherProvider(components, type)) return usedReplacement;
        let dependents: Component[] | null = null;
        for (let i = 0, len = invDependencies.length; i < len; i++) {
          const dependentType = invDependencies[i];
          for (let j = 0; j < n; j++) {
            const comp = components[j];
            if (!(comp instanceof dependentType)) continue;
            if (!dependents) {
              if (
                typeof replace === "function" ||
                !replace?.some((candidate) => candidate === type || candidate.prototype instanceof type)
              ) {
                throw `Should remove ${dependentType.name} before remove ${type.name}`;
              }
              dependents = [];
            }
            if (!dependents.includes(comp)) dependents.push(comp);
          }
        }
        if (dependents) {
          replacedEntries!.push({ dependency: type, dependents });
          usedReplacement = true;
        }
      }
      type = Object.getPrototypeOf(type);
    }
    return usedReplacement;
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
