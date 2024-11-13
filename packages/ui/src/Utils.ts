import { ComponentType, Entity } from "@galacean/engine";
import { UICanvas } from "./component/UICanvas";
import { GroupModifyFlags, UIGroup } from "./component/UIGroup";
import { UIElementDirtyFlag } from "./component/UIRenderer";
import { IElement } from "./interface/IElement";
import { IGroupAble } from "./interface/IGroupAble";

export class Utils {
  static registerListener(
    entity: Entity,
    root: Entity,
    listener: (flag: number, param?: any) => void,
    listeningEntities: Entity[]
  ): void {
    let count = 0;
    while (entity && entity !== root) {
      const preEntity = listeningEntities[count];
      if (preEntity !== entity) {
        // @ts-ignore
        preEntity?._unRegisterModifyListener(listener);
        listeningEntities[count] = entity;
        // @ts-ignore
        entity._registerModifyListener(listener);
      }
      entity = entity.parent;
      count++;
    }
    listeningEntities.length = count;
  }

  static unRegisterListener(listeningEntities: Entity[], listener: (flag: number, param?: any) => void): void {
    for (let i = 0, n = listeningEntities.length; i < n; i++) {
      // @ts-ignore
      listeningEntities[i]._unRegisterModifyListener(listener);
    }
    listeningEntities.length = 0;
  }

  static registerElementToCanvas(element: IElement, canvas: UICanvas, instant: boolean = false): void {
    const preCanvas = element._rootCanvas;
    if (preCanvas !== canvas) {
      element._rootCanvas = canvas;
      if (preCanvas) {
        const replaced = preCanvas._disorderedElements.deleteByIndex(element._indexInRootCanvas);
        replaced && (replaced._indexInRootCanvas = element._indexInRootCanvas);
        element._indexInRootCanvas = -1;
        preCanvas._hierarchyDirty = true;
      }
      if (canvas) {
        const disorderedElements = canvas._disorderedElements;
        element._indexInRootCanvas = disorderedElements.length;
        disorderedElements.add(element);
        canvas._hierarchyDirty = true;
      }
      element._rootCanvas = canvas;
    }
    if (instant) {
      Utils.registerListener(element.entity, canvas?.entity, element._canvasListener, element._canvasListeningEntities);
    }
  }

  static registerElementToGroup(element: IGroupAble, group: UIGroup, instant: boolean = false): void {
    const preGroup = element._group;
    if (preGroup !== group) {
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
      element._group = group;
      instant && element._onGroupModify(GroupModifyFlags.All);
    }
    if (instant) {
      const rootCanvas = element._rootCanvas;
      const root = group ? group.entity : rootCanvas.entity;
      Utils.registerListener(element.entity, root, element._groupListener, element._groupListeningEntities);
    }
  }

  static isContainDirtyFlag(element: IElement, flag: UIElementDirtyFlag) {
    return (element._elementDirty & flag) != 0;
  }

  static setDirtyFlagTrue(element: IElement, flag: UIElementDirtyFlag) {
    element._elementDirty |= flag;
  }

  static setDirtyFlagFalse(element: IElement, flag: UIElementDirtyFlag) {
    element._elementDirty &= ~flag;
  }

  static getRootCanvasInParents(entity: Entity): UICanvas {
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

  static isTheFirstCanvas(canvas: UICanvas): boolean {
    let entity = canvas.entity;
    while (entity) {
      // @ts-ignore
      const components = entity._components;
      for (let i = 0, n = components.length; i < n; i++) {
        const component = components[i];
        if (component.enabled && component._componentType === ComponentType.UICanvas) {
          return false;
        }
      }
      entity = entity.parent;
    }
    return true;
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
