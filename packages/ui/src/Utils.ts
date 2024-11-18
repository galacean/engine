import { ComponentType, Entity } from "@galacean/engine";
import { UICanvas } from "./component/UICanvas";
import { GroupModifyFlags, UIGroup } from "./component/UIGroup";
import { IElement } from "./interface/IElement";
import { IGroupAble } from "./interface/IGroupAble";

export class Utils {
  static _registerListener(
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

  static _unRegisterListener(listener: (flag: number, param?: any) => void, listeningEntities: Entity[]): void {
    for (let i = 0, n = listeningEntities.length; i < n; i++) {
      // @ts-ignore
      listeningEntities[i]._unRegisterModifyListener(listener);
    }
    listeningEntities.length = 0;
  }

  static getCanvasInParents(entity: Entity, root?: Entity): UICanvas {
    entity = entity.parent;
    let rootCanvas: UICanvas = null;
    while (entity && entity !== root) {
      // @ts-ignore
      const components = entity._components;
      for (let i = 0, n = components.length; i < n; i++) {
        const component = components[i];
        if (component.enabled && component._componentType === ComponentType.UICanvas) {
          rootCanvas = <UICanvas>component;
          if (rootCanvas._isRootCanvas) {
            return rootCanvas;
          }
        }
      }
      entity = entity.parent;
    }
    return rootCanvas;
  }

  static getGroupInParents(entity: Entity, canvasEntity: Entity): UIGroup {
    entity = entity.parent;
    while (entity && entity !== canvasEntity) {
      // @ts-ignore
      const components = entity._components;
      for (let i = 0, n = components.length; i < n; i++) {
        const component = components[i];
        if (component.enabled && component._componentType === ComponentType.UIGroup) {
          return <UIGroup>component;
        }
      }
      entity = entity.parent;
    }
    return null;
  }

  static _registerElementToCanvas(element: IElement, pre: UICanvas, cur: UICanvas): void {
    if (pre !== cur) {
      if (pre) {
        const replaced = pre._disorderedElements.deleteByIndex(element._indexInCanvas);
        replaced && (replaced._indexInCanvas = element._indexInCanvas);
        element._indexInCanvas = -1;
      }
      if (cur) {
        const disorderedElements = cur._disorderedElements;
        element._indexInCanvas = disorderedElements.length;
        disorderedElements.add(element);
      }
      // @ts-ignore
      element._canvas = cur;
    }
  }

  static _registerElementToCanvasListener(element: IElement, canvas: UICanvas): void {
    Utils._registerListener(element.entity, canvas?.entity, element._canvasListener, element._canvasListeningEntities);
  }

  static _registerElementToGroup(element: IGroupAble, pre: UIGroup, cur: UIGroup): void {
    if (pre !== cur) {
      if (pre) {
        const replaced = pre._disorderedElements.deleteByIndex(element._indexInGroup);
        replaced && (replaced._indexInGroup = element._indexInGroup);
        element._indexInGroup = -1;
      }
      if (cur) {
        const disorderedElements = cur._disorderedElements;
        element._indexInGroup = disorderedElements.length;
        disorderedElements.add(element);
      }
      // @ts-ignore
      element._group = cur;
    }
  }

  static _registerElementToGroupListener(element: IGroupAble, canvas: UICanvas): void {
    Utils._registerListener(element.entity, canvas?.entity, element._groupListener, element._groupListeningEntities);
  }

  static _onGroupDirty(element: IGroupAble, preGroup: UIGroup): void {
    if (element._isGroupDirty) return;
    element._isGroupDirty = true;
    if (preGroup) {
      const replaced = preGroup._disorderedElements.deleteByIndex(element._indexInGroup);
      replaced && (replaced._indexInGroup = element._indexInGroup);
      element._indexInGroup = -1;
    }
    element._onGroupModify(GroupModifyFlags.All);
  }

  static _onCanvasChange(element: IElement, preCanvas: UICanvas, isGraphics: boolean = false): void {
    if (element._isCanvasDirty) return;
    element._isCanvasDirty = true;
    if (preCanvas) {
      const replaced = preCanvas._disorderedElements.deleteByIndex(element._indexInCanvas);
      replaced && (replaced._indexInCanvas = element._indexInCanvas);
      element._indexInCanvas = -1;
      isGraphics && (preCanvas._hierarchyDirty = true);
    }
  }
}
