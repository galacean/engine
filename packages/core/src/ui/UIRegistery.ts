import { Entity } from "../Entity";
import { ComponentType } from "../enums/ComponentType";
import { UICanvas } from "./UICanvas";
import { UIGroup } from "./UIGroup";
import { IUIElement } from "./interface/IUIElement";

export class UIRegistry {
  static registerEntityListener(element: IUIElement): void {
    const parents = element._parents;
    const root = element._canvas?.entity;
    let entity = element._entity;
    let index = 0;
    while (entity && entity !== root) {
      const preParent = parents[index];
      if (preParent !== entity) {
        preParent?._unRegisterModifyListener(element._onEntityModify);
        parents[index] = entity;
        entity._registerModifyListener(element._onEntityModify);
      }
      entity = entity.parent;
      index++;
    }
    parents.length = index;
  }

  static unRegisterEntityListener(element: IUIElement): void {
    const { _parents: parents } = element;
    for (let i = 0, n = parents.length; i < n; i++) {
      parents[i]._unRegisterModifyListener(element._onEntityModify);
    }
    parents.length = 0;
  }

  static registerElementToCanvas(element: IUIElement, canvas: UICanvas): void {
    const preCanvas = element._canvas;
    if (preCanvas !== canvas) {
      element._canvas = canvas;
      if (preCanvas) {
        const replaced = preCanvas._disorderedElements.deleteByIndex(element._indexInCanvas);
        replaced && (replaced._indexInCanvas = element._indexInCanvas);
        element._indexInCanvas = -1;
        preCanvas._hierarchyDirty = true;
      }
      if (canvas) {
        const disorderedElements = canvas._disorderedElements;
        element._indexInCanvas = disorderedElements.length;
        disorderedElements.add(element);
        canvas._hierarchyDirty = true;
      }
    }
  }

  static registerElementToGroup(element: IUIElement, group: UIGroup): void {
    const preGroup = element._group;
    if (preGroup !== group) {
      element._group = group;
      if (preGroup) {
        const replaced = preGroup._disorderedElements.deleteByIndex(element._indexInGroup);
        replaced && (replaced._indexInGroup = element._indexInGroup);
        element._indexInGroup = -1;
      }
      if (group) {
        const disorderedElements = group._disorderedElements;
        element._indexInGroup = disorderedElements.length;
        disorderedElements.add(element);
      }
    }
  }

  static getRootCanvasInParent(element: IUIElement): UICanvas {
    let entity = element._entity;
    while (entity) {
      const components = entity._components;
      for (let i = 0, n = components.length; i < n; i++) {
        const component = components[i];
        if (
          component.enabled &&
          component._componentType === ComponentType.UICanvas &&
          (<UICanvas>component)._isRootCanvas
        ) {
          return <UICanvas>component;
        }
      }
      entity = entity.parent;
    }
    return null;
  }

  static getGroupInParent(entity: Entity): UIGroup {
    let _meetRootCanvas = false;
    while (entity) {
      const components = entity._components;
      for (let i = 0, n = components.length; i < n; i++) {
        const component = components[i];
        if (component.enabled) {
          switch (component._componentType) {
            case ComponentType.UIRenderer:
              _meetRootCanvas = (<UICanvas>component)._isRootCanvas;
              break;
            case ComponentType.UIGroup:
              return <UIGroup>component;
            default:
              break;
          }
        }
      }
      if (_meetRootCanvas) {
        return null;
      }
      entity = entity.parent;
    }
    return null;
  }
}
