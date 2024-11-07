import { ComponentType, Entity } from "@galacean/engine";
import { UICanvas } from "./component/UICanvas";
import { GroupModifyFlags, UIGroup } from "./component/UIGroup";
import { IUIElement } from "./interface/IUIElement";
import { IUIGroupable } from "./interface/IUIGroupable";

export class Utils {
  static registerEntityListener(element: IUIElement): void {
    const parents = element._parents;
    const root = element._rootCanvas?.entity;
    let entity = element.entity;
    let index = 0;
    while (entity && entity !== root) {
      const preParent = parents[index];
      if (preParent !== entity) {
        // @ts-ignore
        preParent?._unRegisterModifyListener(element._onEntityModify);
        parents[index] = entity;
        // @ts-ignore
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
      // @ts-ignore
      parents[i]._unRegisterModifyListener(element._onEntityModify);
    }
    parents.length = 0;
  }

  static registerElementToCanvas(element: IUIElement, canvas: UICanvas): void {
    const preCanvas = element._rootCanvas;
    if (preCanvas !== canvas) {
      element._rootCanvas = canvas;
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

  static registerElementToGroup(element: IUIGroupable, group: UIGroup): void {
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
      element._onGroupModify(GroupModifyFlags.All);
    }
  }

  static getRootCanvasInParent(entity: Entity): UICanvas {
    while (entity) {
      // @ts-ignore
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

  static getGroupInParents(entity: Entity): UIGroup {
    let meetRootCanvas = false;
    while (entity) {
      // @ts-ignore
      const components = entity._components;
      for (let i = 0, n = components.length; i < n; i++) {
        const component = components[i];
        if (component.enabled) {
          switch (component._componentType) {
            case ComponentType.UICanvas:
              meetRootCanvas = (<UICanvas>component)._isRootCanvas;
              break;
            case ComponentType.UIGroup:
              return <UIGroup>component;
            default:
              break;
          }
        }
      }
      if (meetRootCanvas) {
        return null;
      }
      entity = entity.parent;
    }
    return null;
  }
}
