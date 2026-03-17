import { Component } from "../Component";
import { Entity } from "../Entity";

/**
 * @internal
 * Utility functions for remapping Entity/Component references during cloning.
 */
export class CloneUtils {
  private static _tempRemapPath: number[] = [];

  static remapEntity(srcRoot: Entity, targetRoot: Entity, entity: Entity): Entity {
    const path = CloneUtils._tempRemapPath;
    if (!CloneUtils._getEntityHierarchyPath(srcRoot, entity, path)) return entity;
    return CloneUtils._getEntityByHierarchyPath(targetRoot, path);
  }

  static remapComponent<T extends Component>(srcRoot: Entity, targetRoot: Entity, component: T): T {
    const path = CloneUtils._tempRemapPath;
    const srcEntity = component.entity;
    if (!CloneUtils._getEntityHierarchyPath(srcRoot, srcEntity, path)) return component;
    return CloneUtils._getEntityByHierarchyPath(targetRoot, path)._components[
      srcEntity._components.indexOf(component)
    ] as T;
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
