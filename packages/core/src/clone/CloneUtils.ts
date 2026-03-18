import { Component } from "../Component";
import { Entity, ComponentConstructor } from "../Entity";

/**
 * @internal
 * Utility functions for remapping Entity/Component references during cloning.
 */
export class CloneUtils {
  private static _tempRemapPath: number[] = [];

  static remapEntity(srcRoot: Entity, targetRoot: Entity, entity: Entity): Entity {
    const paths = CloneUtils._tempRemapPath;
    const success = CloneUtils._getEntityHierarchyPath(srcRoot, entity, paths);
    return success ? CloneUtils._getEntityByHierarchyPath(targetRoot, paths) : entity;
  }

  static remapComponent<T extends Component>(srcRoot: Entity, targetRoot: Entity, component: T): T {
    const paths = CloneUtils._tempRemapPath;
    const success = CloneUtils._getEntityHierarchyPath(srcRoot, component.entity, paths);
    if (!success) {
      return component;
    }

    const targetEntity = CloneUtils._getEntityByHierarchyPath(targetRoot, paths);
    if (!targetEntity) {
      return component;
    }

    const type = <ComponentConstructor<T>>component.constructor;
    const srcComponents = component.entity._components;
    let componentIndex = 0;

    for (let i = 0, n = srcComponents.length; i < n; i++) {
      const currentComponent = srcComponents[i];
      if (currentComponent === component) {
        break;
      }
      if (currentComponent instanceof type) {
        componentIndex++;
      }
    }

    const targetComponents = targetEntity._components;
    let currentIndex = 0;
    for (let i = 0, n = targetComponents.length; i < n; i++) {
      const currentComponent = targetComponents[i];
      if (currentComponent instanceof type) {
        if (currentIndex === componentIndex) {
          return currentComponent as T;
        }
        currentIndex++;
      }
    }

    return component;
  }

  private static _getEntityHierarchyPath(rootEntity: Entity, searchEntity: Entity, inversePath: number[]): boolean {
    inversePath.length = 0;
    while (searchEntity !== rootEntity) {
      const parent = searchEntity.parent;
      if (!parent) {
        return false;
      }
      inversePath.push(searchEntity.siblingIndex);
      searchEntity = parent;
    }
    return true;
  }

  private static _getEntityByHierarchyPath(rootEntity: Entity, inversePath: number[]): Entity {
    let entity = rootEntity;
    for (let i = inversePath.length - 1; i >= 0; i--) {
      entity = entity.children[inversePath[i]];
    }
    return entity;
  }
}
